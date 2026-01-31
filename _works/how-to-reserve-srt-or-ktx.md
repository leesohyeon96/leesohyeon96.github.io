# 🤔 궁금하다 궁금해
서울로 상경한 지방인으로서,  
설날·추석마다 반복되는 **명절 예매 전쟁**은 대체 내부적으로 어떻게 동작할까?  
라는 궁금증에서 시작해 설계를 정리해봤다.

---

# 🛠️ 설계를 어떻게 할까?

## 1️⃣ 예매 시작 – 대기열 진입
오전 7시, 사용자가 `[명절 예매]` 버튼을 누르는 순간

- Client → **Redis ZSET 기반 대기열 등록**
```redis
ZADD waiting:queue 173820600012 user1
key: waiting:queue

score: timestamp (입장 시각)

value: userId

public void enterQueue(String userId) {
    long now = System.currentTimeMillis();
    jedis.zadd("waiting:queue", now, userId);
}
📌 Kafka 이벤트 기록
Redis 처리와 동시에 Kafka로 이벤트를 Produce 한다.

사용 목적

로그 / 감사

누가 언제 대기열에 들어왔는가?

누가 토큰을 발급받았는가?

비동기 처리

DB 최종 저장

이메일 / 푸시 알림

외부 시스템 연동

장애 복구

Redis 장애 시 Kafka 로그 기반 대기열 재구성

USER_ENTER_QUEUE
TOKEN_ISSUED
USER_ADMITTED
2️⃣ 실시간 대기 순번 표시
Redis ZSET 조회로 현재 순번 확인

ZRANK waiting:queue user1
읽기 전용 → 빠르고 안전

시간 복잡도: O(log N)

조회 주기: 1~3초

대안: WebSocket / SSE + Redis Pub/Sub

3️⃣ 입장 허용 & 토큰 발급
예약 서버 허용 인원이 100명이라면,
Redis 대기열 상위 100명만 입장 허용

ZRANGE waiting:queue 0 99
⚠️ Lua Script로 원자 처리
대기열 제거 + 토큰 발급을 단일 트랜잭션으로 처리한다.

if redis.call("ZRANK", queueKey, userId) < limit then
   redis.call("ZREM", queueKey, userId)
   redis.call("SET", tokenKey, userId, "EX", 300)
end
중간 실패 ❌

중복 발급 ❌

경쟁 상태 ❌

왜 Redis에 저장?

DB에 토큰을 저장하면 초당 수천~수만 요청으로 DB 병목 발생

Client 응답:

{
  "accessToken": "abc.def.ghi",
  "expiresIn": 300
}
4️⃣ 검색 API – 토큰 검증
GET /trains/search?from=Seoul&to=hometown
Authorization: Bearer {queue-access-token}
GET access:token:abc123
있으면 → OK

없으면 → 401 / 403

5️⃣ 좌석 조회 & 좌석 선점
좌석 조회 (캐시)
seat:availability:{trainId}:{date}
좌석 상태:

Available

Hold

Sold

좌석 선점 (락)
좌석 예약의 핵심 구간

SET seat:hold:{trainId}:{seatNo} userId NX EX 180
NX: 이미 선점된 좌석이면 실패

EX 180: 3분간 임시 선점

TTL 만료 시 자동 반환

DB만 사용하면 row lock 경합으로 데드락 위험 발생

6️⃣ 결제 단계
좌석 선점 이후 결제 진행

결제는 외부 PG 연동

가장 느리고 실패 확률이 높은 구간

좌석 선점 이후 처리하여 트래픽 분산

✅ 결론
예매 시작 시점에는 Redis ZSET 기반 대기열로 사용자 순서를 관리하고,
Kafka를 통해 이벤트를 기록해 비동기 처리와 장애 복구 가능성을 확보한다.

입장 허용 단계에서는 Lua Script를 사용해 대기열 제거와 토큰 발급을
원자적으로 처리함으로써 중복 발급과 경쟁 상태를 방지한다.

발급된 Queue Access Token은 Redis에 TTL 기반으로 저장되며,
예약 API들은 매 요청마다 Redis 조회를 통해 접근 권한을 검증한다.

좌석 조회는 Redis 캐시를 사용해 DB 부하를 줄이고,
좌석 선점 시에는 NX + TTL 기반 Redis 락으로 동시성 문제를 해결한다.

결제는 좌석 선점 이후 진행하여,
가장 느리고 실패 확률이 높은 외부 PG 구간의 트래픽을 분산시킨다.

Redis를 큐, 캐시, 락으로 역할 분리해
명절과 같은 초고트래픽 환경에서도 안정적으로 동작하는 예매 시스템을 구성할 수 있다.