---
layout: post
title: "DAU 100만 쇼핑몰, 어떻게 설계할까?"
date: 2026-06-04
category: 개발
author: 이소현
description: "DAU 100만 쇼핑몰 백엔드 설계 — TPS 추정부터 Redis 재고 처리, Kafka 주문 큐, 멱등성 키까지 단계별 아키텍처 설계"
lang: ko
permalink: /ko/blog/ecommerce-system-design-interview/
---

<br>

DAU 100만인 쇼핑몰 백엔드를 설계한다면 어디서부터 시작해야 할까. 상품 조회, 주문, 결제 흐름을 기준으로 수치 추정부터 병목 해결까지 단계별로 정리한다.

<br>

---

## 목차

- [1. 수치부터 뽑는다](#section-1)
- [2. 읽기 TPS 2,340 — MySQL이 버티나?](#section-2)
- [3. 재고 동시성 — 1,000명이 동시에 주문 버튼을 눌렀다](#section-3)
- [4. 결제 — 네트워크가 끊겼다, 재시도하면 이중 결제가 발생한다](#section-4)
- [5. 전체 아키텍처](#section-5)
- [정리](#summary)

---

# 1. 수치부터 뽑는다 {#section-1}

설계는 수치에서 시작한다. "캐시 쓰면 되지 않나요?"는 수치 없이는 근거 없는 말이다.

사용자 한 명이 앱에서 상품 목록, 상세 페이지, 주문까지 평균 50회 API를 호출한다고 가정하면:

```
DAU: 100만 명
총 요청수: 100만 × 50 = 5,000만 req/일

하루 = 86,400초
평균 TPS: 5,000만 / 86,400 ≈ 578 TPS
피크 TPS (× 5배): 약 2,600~5,800 TPS

읽기:쓰기 = 9:1
→ 읽기 TPS: ~2,340 / 쓰기 TPS: ~260
```

CCU는 DAU의 10~20% 수준. DAU 100만이면 피크 동시접속 약 20만.

피크 배수(5배)는 쇼핑몰 특성상 저녁 8~10시에 트래픽이 몰리기 때문이다. 읽기/쓰기 비율을 구분하는 이유는 이 숫자에 따라 아키텍처 방향이 달라지기 때문이다.

<br>

---

# 2. 읽기 TPS 2,340 — MySQL이 버티나? {#section-2}

MySQL 단일 인스턴스는 쿼리 복잡도에 따라 다르지만 1,000~3,000 TPS 수준이다. 평상시는 버티더라도 피크 시엔 위험하다.

**상품 정보는 자주 바뀌지 않는다.** 같은 상품 상세 페이지를 수백 명이 조회해도 DB에서 매번 읽을 필요가 없다. Redis 캐시를 적용한다.

```
요청 → Redis hit → 응답
     → Redis miss → DB 조회 → Redis 저장 → 응답
```

Cache-Aside(Lazy Loading) 전략이다. 요청이 왔을 때 캐시에 없으면 DB에서 읽고, 있으면 바로 반환한다.

<br>

**상품 정보가 수정되면 캐시는 어떻게 처리할까?**

Master DB update → Replica 반영 → **캐시 무효화(삭제)** 순서로 처리한다.

캐시를 직접 갱신하는 방식은 Replica 반영 전에 캐시만 새 데이터가 되는 불일치 문제가 생길 수 있다. 무효화 후 다음 요청에서 DB에서 새로 로드하는 방식이 더 안전하다.

<br>

**캐시가 만료되는 순간 수백 요청이 동시에 DB로 몰린다면?**

Cache Stampede 문제다. 두 가지 방법으로 대응한다.

- TTL을 랜덤하게 설정해 동시 만료를 분산
- TTL이 다 되어가는 캐시를 미리 갱신 (PER, Probabilistic Early Recomputation)

<br>

---

# 3. 재고 동시성 — 1,000명이 동시에 주문 버튼을 눌렀다 {#section-3}

재고 100개짜리 상품에 1,000명이 동시에 주문하면 재고가 음수가 될 수 있다. DB 락으로 해결하려 하면 플래시세일처럼 동시 요청이 폭발할 때 락 경합으로 처리량이 급감한다.

**Redis Lua Script를 쓴다.** Redis는 싱글 스레드라 Lua Script가 원자적으로 실행된다.

```lua
local stock = redis.call('GET', KEYS[1])
if tonumber(stock) > 0 then
    redis.call('DECR', KEYS[1])
    return 1  -- 성공
else
    return 0  -- 재고 없음
end
```

`DECR`은 Redis가 원자적으로 1 감소시키는 명령어다. `SET`으로 직접 값을 넣으면 동시에 1,000명이 `SET stock 99`를 해버려서 모두 99가 된다. `DECR`은 그 문제가 없다.

1,000명이 동시에 요청해도 정확히 100번만 차감되고 나머지는 실패를 반환한다.

<br>

**차감 성공한 주문을 DB에 어떻게 반영할까?**

상황에 따라 다르게 접근한다.

**평상시 (쓰기 TPS ~260):** DB 직접 INSERT. MySQL이 충분히 감당 가능하다.

**플래시세일 (쓰기 TPS 2,600+):** Kafka에 주문 이벤트를 발행하고 Consumer가 Bulk INSERT로 처리한다. Kafka는 offset으로 처리 위치를 추적하므로 서버가 죽어도 이어서 처리 가능하고 메시지가 유실되지 않는다.

Kafka를 무조건 쓰는 게 아니다. DAU 100만 기준 쓰기 TPS 260은 MySQL이 충분히 소화한다. Kafka는 피크 시나 여러 서비스가 이벤트를 구독해야 할 때 진가를 발휘한다.

<br>

---

# 4. 결제 — 네트워크가 끊겼다, 재시도하면 이중 결제가 발생한다 {#section-4}

결제 완료 후 응답을 받기 직전에 네트워크가 끊기면 클라이언트는 결제가 됐는지 모른다. 재시도하면 이중 결제가 날 수 있다.

**멱등성 키(Idempotency Key)** 로 해결한다.

**① 클라이언트** — 결제 요청 시 UUID 생성 → 헤더에 포함
```
Idempotency-Key: uuid-abc-123
```

**② 서버** — Redis `SET NX`로 해당 키 저장 시도

- 저장 **성공** (처음 요청) → 결제 처리 진행
- 저장 **실패** (중복 요청) → 이전 결과 그대로 반환, 재처리 없음

`SET NX`는 "키가 없을 때만 저장"하는 원자 명령어다. 동시에 두 요청이 들어와도 하나만 통과한다.

DB unique 제약으로도 막을 수 있지만, Redis NX가 더 빠르고 외부 결제사 호출 전에 걸러낼 수 있어서 효율적이다. 락을 거는 방식은 외부 결제사 호출(수백ms~수초) 동안 락을 잡아야 해서 부담이 크다.

<br>

---

# 5. 전체 아키텍처 {#section-5}

```
[클라이언트]
    ↓
[CDN]
  └─ 정적 리소스 캐싱
    ↓
[API Gateway]
  └─ 인증, Rate Limiting
    ↓
[API 서버 (수평 확장)]
    │
    ├─ 상품 조회
    │     ↓
    │  [Redis Cache]
    │     ↓ miss
    │  [MySQL Read Replica]
    │
    ├─ 재고 차감
    │     ↓
    │  [Redis Lua DECR]
    │     ↓ 성공
    │  [Kafka 주문 이벤트 발행]
    │     ↓
    │  [Consumer]
    │     ↓
    │  [MySQL Primary — Bulk INSERT]
    │
    └─ 결제
          ↓
       [Redis SET NX — 멱등성 키 체크]
          ↓ 통과
       [외부 결제사 API]
```

읽기는 Redis → Read Replica로 DB 부하를 분산하고, 쓰기는 Redis에서 동시성을 처리한 뒤 Kafka로 DB에 비동기 반영한다.

<br>

---

# 정리 {#summary}

| 문제 | 해결 |
|---|---|
| 읽기 TPS 과부하 | Redis Cache-Aside |
| 캐시 동시 만료 | TTL 랜덤화 / PER |
| 재고 동시 차감 | Redis Lua DECR |
| 주문 DB 반영 | 평상시 직접 INSERT, 피크 시 Kafka |
| 이중 결제 | 멱등성 키 + Redis SET NX |

<br>

---

# 📚 참고 자료

**시스템 설계 / DAU-TPS 추정**
- Alex Xu, *System Design Interview Vol. 1* (2020), Chapter 1 — Back-of-the-envelope estimation

**Cache-Aside / 캐시 전략**
- [AWS Caching Best Practices](https://aws.amazon.com/caching/best-practices/) — Cache-Aside 패턴 공식 설명
- [Redis Docs: Caching](https://redis.io/docs/manual/patterns/)

**Redis DECR / 재고 동시성**
- [Redis DECR 공식 문서](https://redis.io/commands/decr/) — 원자적 감소 연산
- [Redis Lua Scripting](https://redis.io/docs/manual/programmability/lua-api/) — Lua 스크립트로 원자성 보장

**Kafka 비동기 주문**
- [Apache Kafka 공식 문서](https://kafka.apache.org/documentation/)
- [Confluent: Kafka Use Cases](https://www.confluent.io/use-case/kafka-as-message-queue/)

**멱등성 키 (Idempotency Key)**
- [Stripe API Docs: Idempotent Requests](https://stripe.com/docs/api/idempotent_requests) — 실무 구현 사례
- [RFC 7231 Section 4.2.2](https://datatracker.ietf.org/doc/html/rfc7231#section-4.2.2) — HTTP 멱등성 정의
