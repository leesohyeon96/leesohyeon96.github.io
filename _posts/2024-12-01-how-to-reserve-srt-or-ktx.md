---
layout: post
title: "SRT/KTX 예매 시스템 설계"
date: 2026-02-01
category: 개발
#image: assets/img/blog/default.png
author: 이소현
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
이때, Redis 처리와 동시에 Kafka로 이벤트를 Produce 한다

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


<br>

---

## 2️⃣ 실시간 대기 순번 표시
- Redis ZSET 조회로 현재 순번 확인
```redis
ZRANK waiting:queue user1
```

- 읽기 전용 → 빠르고 안전
- 시간 복잡도: O(log N)
- 조회 주기: 1~3초
- 대안: WebSocket / SSE + Redis Pub/Sub

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

<br>

---

## 6️⃣ 결제 단계

- 좌석 선점 이후 결제 진행
- 결제는 외부 PG 연동 → 가장 느리고 실패 확률이 높은 구간
- 좌석 선점 이후 처리하여 트래픽 분산

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