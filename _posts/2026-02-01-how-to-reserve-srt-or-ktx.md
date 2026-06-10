---
layout: post
title: "SRT/KTX 예매 시스템 설계"
date: 2026-02-01
category: 개발
#image: assets/img/blog/default.png
author: 이소현
description: "SRT/KTX 예매 시스템을 직접 설계한 과정. 동시성 문제, 대기열, DB 설계를 포함한 시스템 설계 글"
lang: ko
permalink: /ko/blog/how-to-reserve-srt-or-ktx/
---

<br>

# 🤔 궁금하다 궁금해
서울로 상경한 지방인으로서,  
설날·추석마다 반복되는 **명절 예매 전쟁**은 대체 내부적으로 어떻게 동작할까?  
라는 궁금증에서 시작해 설계를 정리해봤다.

<br>

---

# UI 동작방식 설명
1. 일단 오전7시에 딱 [열차 명절예매]를 클릭함
2. 그럼 대기열에 들어가고 내 앞에 대기중인 사람들이 조회된다
3. 대기 순번이 줄어들어서 접속하게 되면 열차 검색 및 좌석 선택이 가능한 화면에 입장하게 된다
4. 그럼 좌석을 예매하면 된다
5. 이때, 결제는 바로 하지 않고 날짜를 정해 그때 가능함!

## 그럼 인제 어떻게 설계되있는지 상상을 해서 말해보자면!!

<br>

---

## 1️⃣ 예매 시작 – 대기열 진입
오전 7시, 사용자가 `[명절 예매]` 버튼을 누르는 순간

- Client → **Redis ZSET 기반 대기열 등록**
```redis
ZADD waiting:queue 173820600012 user1
```
- key: waiting:queue
- score: timestamp (입장 시각)
- value: userId

```java
public void enterQueue(String userId) {
    long now = System.currentTimeMillis();
    jedis.zadd("waiting:queue", now, userId);
}
```


📌 Kafka 이벤트 기록
Redis 처리 후 Kafka로 이벤트를 Produce 한다.

## 사용 목적
- 로그 / 감사
  - 누가 언제 대기열에 들어왔는가?
  - 누가 토큰을 발급받았는가?
- 비동기 처리
  - DB 최종 저장
  - 이메일 / 푸시 알림
  - 외부 시스템 연동
- 장애 복구
  - Redis 장애 시 Kafka 로그 기반 대기열 재구성

예시 이벤트: USER_ENTER_QUEUE, TOKEN_ISSUED, USER_ADMITTED

> ⚠️ **Redis 성공 후 Kafka produce 실패 시**: Kafka produce는 retry 정책으로 재시도하고, 최종 실패 시 로그만 유실되는 수준 — 대기열 자체는 Redis에 정상 등록돼 있어 서비스에 영향 없음. Kafka는 핵심 플로우가 아닌 **로그/비동기 보조 용도**이므로 허용 가능한 실패.


<br>

---

## 2️⃣ 실시간 대기 순번 표시
- Redis ZSET 조회로 현재 순번 확인
```redis
ZRANK waiting:queue user1
```

- 읽기 전용 → 빠르고 안전
- 시간 복잡도: O(log N)
- 조회 주기: 1~3초 (폴링)
  - 대기자 수만 명 시 Redis 조회 부하 증가 → 실제 서비스는 **WebSocket / SSE + Redis Pub/Sub** 방식이 적합
  - Pub/Sub: 순번 변경 시에만 서버가 클라이언트에 푸시 → 불필요한 조회 제거

<br>

---

## 3️⃣ 입장 허용 & 토큰 발급
예약 서버 허용 인원이 100명이라면 <br>
Redis 대기열 상위 100명만 입장 허용

```redis
ZRANGE waiting:queue 0 99
```

⚠️ Lua Script로 원자 처리: 대기열 제거 + 토큰 발급을 단일 트랜잭션으로 처리

```lua
if 
  redis.call("ZRANK", queueKey, userId) < limit 
then
  redis.call("ZREM", queueKey, userId)
  redis.call("SET", tokenKey, userId, "EX", 300)
end
```
- 중간 실패 ❌
- 중복 발급 ❌
- 경쟁 상태 ❌

### 이때, 토큰 발급 후 왜 Redis에 저장?
- DB에 토큰을 저장하면 초당 수천~수만 요청으로 DB 병목 발생
- Client 응답 예시
```json
{
  "accessToken": "abc.def.ghi",
  "expiresIn": 300
}
```

### Redis 서버가 죽으면 토큰이 유실되지 않나?
맞다. Redis는 인메모리라 서버가 죽으면 토큰 데이터가 사라진다.

대응 방법:
- **Redis Replica + Sentinel**: Master 장애 시 Replica로 자동 Failover → 데이터 보존
- **AOF 영속성**: `appendonly yes` 설정 시 디스크에 로그 기록 → 재시작 후 복구 가능

단, 입장 토큰은 **일시적 데이터**라서 결제·재고처럼 엄격한 내구성이 필요하지 않다. 유실되더라도 사용자가 대기열에 재입장하면 되므로, 실용적으로는 Replica 구성 정도로 충분하다.

<br>

---

## 4️⃣ 검색 API – 토큰 검증
```pgsql
GET /trains/search?from=Seoul&to=hometown
Authorization: Bearer {queue-access-token}
```
- Redis 조회:
```redis
GET access:token:abc123
```
- 있으면 → OK
- 없으면 → 401 / 403

<br>

---

## 5️⃣ 좌석 조회 & 좌석 선점

### 좌석 조회 (캐시)
```redis
seat:availability:{trainId}:{date}
```
- 좌석 상태: Available / Hold / Sold

### 좌석 선점 (락)
```redis
SET seat:hold:{trainId}:{seatNo} userId NX EX 180
```
- NX: 이미 선점된 좌석이면 실패
- EX 180: 3분간 임시 선점
- TTL 만료 시 자동 반환

### 왜 Redis?
- DB만 사용하면 row lock 경합으로 데드락 위험 발생

### seat:availability랑 seat:hold, 키가 두 개인 이유?
역할이 다르다.
- `seat:availability` = 전체 좌석 상태 **캐시** (조회 최적화용)
- `seat:hold` = 개별 좌석 **선점 락** (동시성 제어용)

### seat:availability 캐시랑 실제 선점 상태가 불일치하면?
캐시엔 Available인데 실제로 누군가 hold 중인 경우 → 사용자가 클릭했는데 `SET NX` 실패.
이 경우 UI에서 "이미 선점된 좌석" 안내.
최종 정합성은 `seat:hold` NX로 보장, 캐시는 "대략적 상태" 표시용.

### DB의 SELECT FOR UPDATE 쓰면 안 돼?
가능하다. 단, 명절 트래픽처럼 수천 명이 동시에 같은 좌석을 클릭하면 row lock 대기가 쌓이며 타임아웃이 폭발한다. Redis NX는 락 대기 없이 즉시 성공/실패를 반환하므로 초고트래픽 환경에 적합하다.

<br>

---

## 6️⃣ 결제 단계

실제 SRT/KTX처럼 **결제는 나중에** 하는 구조다.

**흐름:**
1. 좌석 선점 (Redis SET NX EX 180)
2. 사용자가 예매 확정 → DB에 예약 저장 + `DEL seat:hold:...` (락 해제)
3. 결제는 나중에 (후불)

**좌석 처리 케이스:**
- 예매 확정 전 이탈 → TTL 180초 자동 만료 → 좌석 자동 반환
- 예매 확정 → Redis 키 즉시 DEL → DB에 예약 기록
- 나중에 결제 실패 → DB 예약 상태를 취소로 변경 (Redis 키는 이미 없음)

결제가 외부 PG 연동이라 가장 느리고 실패 확률이 높은 구간이므로, 좌석 확정과 분리해 처리한다.

<br>

---


✅ 결론
- 예매 시작 시점에는 Redis ZSET 기반 대기열로 사용자 순서를 관리하고 <br> Kafka를 통해 이벤트를 기록해 비동기 처리와 장애 복구 가능성을 확보
- 입장 허용 단계에서는 Lua Script를 사용해 대기열 제거와 토큰 발급을 원자적으로 처리
- 발급된 Queue Access Token은 Redis에 TTL 기반으로 저장 
- 예약 API들은 매 요청마다 Redis 조회를 통해 접근 권한 검증 
- 좌석 조회는 Redis 캐시를 사용해 DB 부하를 줄이고 <br> 좌석 선점 시 NX + TTL 기반 Redis 락으로 동시성 문제 해결
- 결제는 좌석 선점 이후 진행 → 트래픽 분산
- Redis를 큐, 캐시, 락으로 역할 분리해 명절과 같은 초고트래픽 환경에서도 안정적으로 동작하는 예매 시스템 구성

---

## 🧪 실제 구현 및 테스트

위에서 설명한 설계를 실제로 구현하고 JMeter를 사용한 부하 테스트를 진행했습니다.

👉 [SRT/KTX 예매 시스템 구현 및 JMeter 부하 테스트](/ko/blog/train-reservations-jmeter-test/)에서 구현 코드와 테스트 결과를 확인할 수 있습니다.