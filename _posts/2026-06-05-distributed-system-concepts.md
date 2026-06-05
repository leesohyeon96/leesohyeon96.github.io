---
layout: post
title: "다중 서버 환경에서 마주치는 문제들 — 세션, Replica, 동시성, 분산 락"
date: 2026-06-05
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/distributed-system-concepts/
---

<br>

서버를 한 대에서 여러 대로 늘리는 순간 새로운 문제들이 생긴다. 세션 불일치, 복제 지연, 동시성 충돌, 락 경합. 각 문제와 해결 방법을 순서대로 정리한다.

<br>

---

# 1. 다중 서버 — 세션이 깨진다

서버를 여러 대 띄우면 로드밸런서가 요청을 분산한다. 사용자 A가 서버 1에 로그인했는데 다음 요청이 서버 2로 가면 서버 2는 로그인 정보를 모른다.

**해결 방법 1 — Sticky Session**

같은 사용자의 요청을 항상 같은 서버로 보낸다. 단순하지만 서버가 죽으면 그 서버에 세션이 묶여있던 사용자들이 모두 로그아웃된다.

**해결 방법 2 — JWT**

서버가 상태를 저장하지 않는 stateless 방식. Access Token을 클라이언트가 들고 있고 매 요청마다 헤더에 포함한다. 어느 서버로 가든 토큰만 검증하면 되므로 서버 대수와 무관하다.

<br>

**JWT의 단점 — 토큰을 강제 무효화할 수 없다**

한번 발급한 토큰은 만료 시간 전까지 막을 방법이 없다. 로그아웃해도 탈취된 토큰이 살아있을 수 있다.

**Access Token + Refresh Token 조합으로 완화한다.**

- Access Token: 만료 5~15분 (짧게)
- Refresh Token: 만료 7~30일 (길게)

Access Token이 탈취돼도 15분 후면 만료된다. Refresh Token은 서버에서 관리하므로 강제 만료 가능.

<br>

**탈취된 Access Token을 15분도 기다리지 않고 즉시 막으려면?**

**Redis 블랙리스트** 방식을 쓴다.

```
로그아웃 → 해당 Access Token을 Redis에 저장 (TTL = 토큰 남은 만료 시간)
API 요청 → Redis 블랙리스트 체크 → 있으면 401 반환
```

평소엔 Redis 조회 없이 토큰 검증만 하고, 로그아웃할 때만 Redis에 등록한다. Redis가 인메모리라 응답속도 1ms 이하이므로 TPS 수백~수천 수준에서도 부담 없다.

<br>

---

# 2. Read Replica — 방금 쓴 데이터가 안 보인다

읽기 부하를 줄이려고 Read Replica를 붙이면 Master에 쓴 데이터가 Replica에 바로 반영되지 않는다. **Replication Lag** 때문이다.

**Replica에서 읽으면 안 되는 데이터:**
- 재고 수량
- 결제 상태
- 주문 정보

방금 주문했는데 재고가 아직 차감 안 된 걸 읽으면 잘못된 재고를 보여주게 된다. 이런 데이터는 Master에서 직접 읽어야 한다.

**Replica에서 읽어도 괜찮은 데이터:**
- 상품 상세 정보 (자주 안 바뀜)
- 댓글, 좋아요 수
- 인기글 목록

약간의 지연이 허용되는 데이터다. 읽기 요청의 대부분이 여기에 해당하므로 Replica만 잘 활용해도 Master 부하를 크게 줄일 수 있다.

<br>

---

# 3. 동시성 — 쿠폰 1,000장에 5,000명이 몰렸다

선착순 쿠폰 1,000장에 5,000명이 동시에 요청하면 수량 초과 발급이 생길 수 있다.

**DB 레벨 해결 — SELECT FOR UPDATE**

```sql
BEGIN;
SELECT count FROM coupons WHERE id = 1 FOR UPDATE;
-- count < 1000이면
INSERT INTO user_coupons (user_id, coupon_id) VALUES (?, ?);
UPDATE coupons SET count = count + 1 WHERE id = 1;
COMMIT;
```

행에 락을 걸고 체크 + INSERT를 원자적으로 처리한다. 안전하지만 5,000명이 줄 서서 기다리므로 처리량이 급감한다.

**Redis 레벨 해결 — DECR (추천)**

```lua
local stock = redis.call('GET', KEYS[1])
if tonumber(stock) > 0 then
    redis.call('DECR', KEYS[1])
    return 1
else
    return 0
end
```

Redis에서 먼저 1,000명만 통과시키고 나머지 4,000명은 DB까지 가지도 못하게 즉시 거절한다. DB 락 경합이 없고 처리량이 훨씬 높다.

중복 발급 방지는 `(user_id, coupon_id)` unique 제약으로 DB 레벨에서 추가로 보장한다.

<br>

---

# 4. 분산 락 — 서버 여러 대에서 같은 데이터를 동시에 수정한다

포인트 충전처럼 같은 사용자 데이터를 여러 서버가 동시에 수정하면 데이터 불일치가 생긴다.

```
포인트 잔액: 1,000점
서버1: 잔액 읽음(1,000) → 500 충전 → 1,500 저장
서버2: 잔액 읽음(1,000) → 500 충전 → 1,500 저장
결과: 1,000점 충전했는데 잔액은 1,500 → 500점 증발
```

**Redis 분산 락으로 해결한다.**

```
SET lock:point:user123 "server1" NX EX 30
```

`NX` = 키가 없을 때만 SET (원자적).
`EX 30` = TTL 30초.

```
서버1: SET NX 성공 → 락 획득 → 포인트 처리 → 락 해제
서버2: SET NX 실패 → 대기 또는 실패 반환
```

<br>

**서버가 락 잡은 채로 죽으면?**

TTL이 있으므로 30초 후 자동으로 락이 풀린다.

**작업이 TTL보다 오래 걸리면?**

락 갱신(Watchdog)으로 해결한다. Redisson(Java Redis 클라이언트)이 자동으로 TTL을 연장해준다. 작업이 진행 중인 동안 TTL의 1/3 시간마다 자동 갱신.

**Redis 서버 자체가 죽으면?**

인메모리라 락 정보가 날아간다. 여러 서버가 동시에 락을 획득할 수 있다.

**Redlock 알고리즘**으로 해결한다. Redis 서버를 5대 두고 과반수(3대 이상)에서 락 획득 성공해야 락을 인정하는 방식이다.

```
서버1 → Redis A, B, C, D, E에 SET NX 시도
A, B, C 성공 (과반수) → 락 획득
D, E 실패해도 무관
```

Redis 한 대가 죽어도 나머지 과반수가 살아있으면 정상 동작한다.

<br>

---

# 정리

| 문제 | 해결 |
|---|---|
| 다중 서버 세션 불일치 | JWT (stateless) |
| 탈취된 토큰 즉시 무효화 | Redis 블랙리스트 + TTL |
| Replication Lag | 정합성 중요한 데이터는 Master에서 읽기 |
| 동시 다발 요청 수량 초과 | Redis DECR + DB unique 제약 |
| 다중 서버 동시 수정 | Redis 분산 락 (SET NX + TTL) |
| 락 보유 중 서버 죽음 | TTL 자동 만료 |
| 작업 > TTL | Watchdog 락 갱신 |
| Redis 서버 죽음 | Redlock (과반수 합의) |
