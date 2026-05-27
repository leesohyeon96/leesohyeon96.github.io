---
layout: post
title: "Kafka 고급 개념 정리: Schema Registry부터 Exactly Once까지"
date: 2026-05-27
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/kafka-advanced-concepts/
---

<br>

Kafka 기본(토픽, 파티션, 컨슈머 그룹)은 알고 있다는 전제로, 실무에서 자주 마주치는 고급 개념들을 정리한다.

<br>

---

# 📐 Schema Registry

## 왜 필요한가

Kafka는 메시지를 그냥 바이트 배열로 전송한다. 프로듀서가 보내는 데이터 구조가 바뀌면 컨슈머가 파싱에 실패한다.

Schema Registry는 **프로듀서와 컨슈머 사이의 공동 계약서 저장소**다. "우리 이 형식으로 데이터 주고받자"는 스키마를 중앙에서 관리하고, 버전 이력을 유지하며, 계약을 깨는 스키마 변경을 사전에 차단한다.

```
Producer → [스키마 등록/조회] → Schema Registry
Producer → [스키마 ID + 직렬화된 데이터] → Kafka Topic → Consumer
Consumer → [스키마 ID로 스키마 조회] → Schema Registry
```

## 동작 방식

1. 프로듀서가 메시지 전송 전 스키마를 Registry에 등록 (이미 있으면 ID만 조회)
2. 메시지 앞에 **Magic Byte(1바이트) + Schema ID(4바이트)** 를 붙여서 전송
3. 컨슈머가 Schema ID로 Registry에서 스키마를 가져와 역직렬화

Kafka 메시지 내부 구조는 이렇다:

```
[ 0x00 | schemaId=15 | binary data ... ]
  1byte    4bytes        나머지
```

Magic Byte(`0x00`)는 Confluent 직렬화 포맷임을 나타내는 식별자. Schema ID만 보면 Registry에서 스키마를 즉시 조회할 수 있어서 컨슈머가 메시지 전체를 파싱할 필요 없이 앞 5바이트만 읽으면 된다.

## 버전 관리와 호환성 체크

스키마는 버전 단위로 관리된다. 새 스키마를 등록할 때 Registry가 **호환성 정책**에 따라 이전 버전과의 호환 여부를 자동으로 검증하고, 호환성을 깨는 변경이면 등록 자체를 거부한다.

| 정책 | 의미 |
|---|---|
| `BACKWARD` | 새 스키마로 이전 데이터 읽기 가능 (기본값) |
| `FORWARD` | 이전 스키마로 새 데이터 읽기 가능 |
| `FULL` | 양방향 호환 |
| `NONE` | 호환성 체크 없음 |

<br>

### BACKWARD (기본값)

> **"새 컨슈머가 과거 메시지를 읽을 수 있어야 한다"**

**허용되는 변경:**
- 필드 삭제 (단, default 값 있어야 함)
- default 있는 필드 추가

**허용 안 되는 변경:**
- default 없는 필드 추가 (과거 메시지엔 해당 필드가 없으므로)
- 필드 타입 변경

`order-v1.avsc` — 현재 스키마

```json
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "amount",  "type": "double"}
  ]
}
```

`order-v2.avsc` — BACKWARD 통과 ✅ (신규 필드에 `"default"` 있음)

```json
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "orderId",  "type": "string"},
    {"name": "amount",   "type": "double"},
    {"name": "currency", "type": "string", "default": "KRW"}
  ]
}
```

`order-v2.avsc` — BACKWARD 실패 ❌ (신규 필드에 `"default"` 없음 → 구버전 메시지 역직렬화 불가)

```json
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "orderId",  "type": "string"},
    {"name": "amount",   "type": "double"},
    {"name": "currency", "type": "string"}
  ]
}
```

**개발자가 해야 할 일:**
1. 새 스키마(`order-v2.avsc`) 작성 — 신규 필드엔 반드시 `"default"` 지정
2. **컨슈머 먼저 배포** (v2 스키마 이해 가능한 상태로)
3. 프로듀서 배포 (이제 v2 스키마로 메시지 전송 시작)

→ 롤링 배포 중 구버전 프로듀서가 보낸 메시지도 새 컨슈머가 문제없이 처리.

<br>

### FORWARD

> **"구버전 컨슈머가 새 메시지를 읽을 수 있어야 한다"**

**허용되는 변경:**
- default 없는 필드 추가 (구버전 컨슈머는 해당 필드를 모르지만 무시)
- default 있는 필드 삭제

**허용 안 되는 변경:**
- default 없는 필드 삭제 (구버전이 해당 필드를 기대하므로)

`order-v1.avsc` — 현재 스키마

```json
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "amount",  "type": "double"}
  ]
}
```

`order-v2.avsc` — FORWARD 통과 ✅ (`"default"` 없어도 OK — 구버전 컨슈머는 모르는 필드 무시)

```json
{
  "type": "record",
  "name": "Order",
  "fields": [
    {"name": "orderId",  "type": "string"},
    {"name": "amount",   "type": "double"},
    {"name": "currency", "type": "string"}
  ]
}
```

**개발자가 해야 할 일:**
1. 새 스키마 작성 후 Registry에 등록
2. **프로듀서 먼저 배포** (v2 스키마로 메시지 전송 시작)
3. 컨슈머 배포 (아직 구버전이어도 새 메시지 처리 가능)

→ BACKWARD와 배포 순서가 반대.

<br>

### FULL

> **BACKWARD + FORWARD 동시 만족**

두 정책의 교집합이므로 허용 범위가 가장 좁다.

**허용되는 변경:**
- default 있는 필드 추가
- default 있는 필드 삭제

**허용 안 되는 변경:**
- default 없는 필드 추가/삭제
- 필드 타입 변경

FULL 통과 ✅ — `"default"` 있는 필드 추가

```json
{"name": "currency", "type": "string", "default": "KRW"}
```

FULL 실패 ❌ — `"default"` 없는 필드 추가

```json
{"name": "currency", "type": "string"}
```

**개발자가 해야 할 일:**
- 모든 신규 필드에 `"default"` 필수
- 필드 삭제 전 해당 필드에 `"default"` 먼저 추가하는 두 단계 배포 권장
- 배포 순서 자유 (컨슈머/프로듀서 어느 쪽 먼저 올려도 됨)

→ 마이크로서비스처럼 컨슈머·프로듀서 팀이 분리돼 있고 배포 순서 조율이 어려울 때 적합.

<br>

실무에서는 `BACKWARD`가 기본. 컨슈머를 먼저 배포하고(새 스키마 이해 가능), 프로듀서를 나중에 배포하는 롤링 업데이트 방식과 궁합이 맞다.

<br>

---

# 🗜️ Avro vs Protobuf

Kafka는 메시지를 결국 바이너리로 전송한다. **"객체 → 바이트"** 변환 방식이 필요한데, JSON보다 빠르고 용량이 작은 스키마 기반 직렬화 포맷을 쓴다.

**공통점:**
- 스키마 정의 필수
- JSON 대비 빠른 직렬화 속도, 작은 페이로드
- 버전 호환성 관리 가능

<br>

## Avro

Kafka에서 가장 널리 쓰이는 포맷. Confluent 생태계의 사실상 표준.

**특징:**
- `.avsc` 파일로 스키마를 JSON 형식으로 정의
- 스키마 없이는 역직렬화 불가 → Schema Registry와 거의 세트
- Schema evolution(필드 추가/삭제)이 자연스럽게 지원됨

`order.avsc`

```json
{
  "type": "record",
  "name": "Order",
  "namespace": "com.example",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "amount",  "type": "double"},
    {"name": "userId",  "type": ["null", "string"], "default": null}
  ]
}
```

**장점:** Kafka 생태계 표준, Schema Registry 연동 자연스러움, schema evolution 강력  
**단점:** Java 중심 느낌 강함, 스키마 파일 없으면 읽을 수 없음

<br>

## Protobuf

구글이 만든 포맷. gRPC의 기본 직렬화 방식.

**특징:**
- `.proto` 파일로 스키마 정의 (IDL 방식)
- **필드 번호(태그) 기반** → 필드명을 바꿔도 번호만 유지하면 하위 호환성 유지
- Avro보다 살짝 더 가볍고 빠름

```protobuf
// order.proto
syntax = "proto3";

message Order {
  string order_id = 1;
  double amount    = 2;
  string user_id   = 3;  // optional in proto3
}
```

필드 번호가 핵심이다. `order_id`를 `orderId`로 이름을 바꿔도 `= 1` 번호가 같으면 구버전 컨슈머가 여전히 읽을 수 있다.

**장점:** gRPC 스택과 궁합 최고, 더 가볍고 빠름, 언어 중립적  
**단점:** Schema Registry 연동이 Avro보다 덜 자연스러움, Kafka에서는 Avro가 더 "표준"

<br>

## 한눈에 비교

| 기준 | Avro | Protobuf |
|---|---|---|
| Kafka 표준 여부 | ✅ 사실상 표준 | 덜 표준 |
| Schema Registry 연동 | 자연스러움 (필수) | 외부 설정 필요 (선택적) |
| 스키마 정의 방식 | JSON (`.avsc`) | IDL (`.proto`) |
| 호환성 기반 | 필드명 + 타입 | 필드 번호 (태그) |
| gRPC 연동 | 어색 | ✅ 네이티브 |
| 성능 | 빠름 | 살짝 더 빠름 |

**선택 기준:** Kafka 중심 시스템이면 Avro, 기존에 gRPC/Protobuf 스택 쓰는 조직이면 Protobuf.

<br>

---

# 🌊 Kafka Streams

## 개념

Kafka Streams는 Kafka 위에서 동작하는 **스트림 처리 라이브러리**다. 별도 클러스터(Flink, Spark) 없이 일반 Java 애플리케이션 안에서 실시간 데이터 처리 가능.

## 핵심 추상화

세 가지 모두 헷갈리는데, **"시간 vs 상태"** 관점으로 보면 바로 이해된다.

| 타입 | 핵심 | 비유 |
|---|---|---|
| KStream | 모든 이벤트 기록 (history) | 카톡 대화 로그 |
| KTable | 현재 상태 (current) | DB 테이블 |
| GlobalKTable | 전체 복사된 참조 데이터 | 전 직원에게 배포된 엑셀 파일 |

<br>

### KStream — "이벤트 흐름"

> **데이터 하나하나가 독립된 사건(event)이다**

같은 key가 여러 번 와도 전부 별개의 이벤트로 취급한다. 과거 상태를 모르고 계속 흘러간다.

```
orderId=1, price=1000  → 이벤트
orderId=2, price=2000  → 이벤트
orderId=1, price=1500  → 이벤트 (orderId=1의 "수정"이 아니라 새 이벤트)
```

카톡 메시지를 생각하면 된다. 같은 사람이 메시지를 여러 번 보내도 각각 독립된 메시지이고, 이전 메시지가 지워지지 않는다.

<br>

### KTable — "현재 상태"

> **같은 key면 최신 값만 남긴다**

같은 key로 새 메시지가 오면 이전 값을 덮어쓴다. 항상 "지금 이 순간의 상태"만 보존한다.

```
user1 → login   (저장)
user1 → logout  (덮어씀)
user1 → login   (덮어씀)

결과: user1 = login  ← 최신 상태만 남음
```

DB 테이블과 동일하다. `UPDATE`처럼 동작. 내부적으로는 Kafka의 changelog 토픽에 저장된다.

<br>

### GlobalKTable — "전체 복사된 KTable"

> **모든 인스턴스가 전체 데이터를 다 들고 있다**

일반 KTable은 파티션 단위로 나뉘어 있어서, 특정 인스턴스가 전체 데이터를 갖지 못한다. join할 때 문제가 된다.

```
KTable (파티션 2개 기준):
  인스턴스 A → 파티션 0 데이터만 보유
  인스턴스 B → 파티션 1 데이터만 보유

→ A에서 join 시도 시 파티션 1 데이터 없음 → join 실패 가능
```

GlobalKTable은 모든 파티션 데이터를 모든 인스턴스에 복제한다.

```
GlobalKTable:
  인스턴스 A → 전체 데이터 보유
  인스턴스 B → 전체 데이터 보유

→ 어느 인스턴스에서 join해도 항상 성공
```

전 직원에게 동일한 엑셀 파일을 배포한 것과 같다. 어느 직원이 조회해도 같은 내용.

**언제 쓰나:** 상품 정보, 코드 테이블처럼 크기가 작고 자주 join하는 참조 데이터. 데이터가 크면 모든 인스턴스에 복제 비용이 커지므로 주의.

```java
StreamsBuilder builder = new StreamsBuilder();

KStream<String, Order> orders = builder.stream("orders");
KTable<String, User> users = builder.table("users");

orders
    .join(users, (order, user) -> enrichOrder(order, user))
    .filter((key, enrichedOrder) -> enrichedOrder.getAmount() > 1000)
    .to("high-value-orders");
```

## 상태 저장

Kafka Streams는 상태를 **RocksDB**(로컬 디스크)에 저장하고, 내부 changelog 토픽으로 백업한다. 인스턴스가 재시작되면 changelog 토픽에서 상태를 복원.

## Windowing

시간 기반 집계에 사용:

| 윈도우 타입 | 특징 |
|---|---|
| Tumbling | 겹치지 않는 고정 크기 (e.g. 매 1분) |
| Hopping | 겹치는 고정 크기 (e.g. 1분 윈도우, 30초마다 슬라이드) |
| Session | 이벤트 간격 기반 동적 크기 |

<br>

---

# ✅ Exactly Once Semantics (EOS)

> **기본은 At-Least-Once. Exactly Once는 필요할 때만 쓴다.**

"Exactly Once를 항상 지향해야 한다"는 오해가 많다. 실무 기본값은 At-Least-Once이고, Exactly Once는 중복이 실제 문제가 되는 시스템에서만 적용한다.

## 3가지 보장 모델

| 수준 | 의미 | 결과 |
|---|---|---|
| At Most Once | 최대 1번 (유실 가능) | 빠르지만 데이터 날아갈 수 있음 |
| At Least Once | 최소 1번 (중복 가능) | **실무 기본값** |
| Exactly Once | 정확히 1번 | 안전하지만 복잡하고 오버헤드 있음 |

<br>

## At-Least-Once가 기본인 이유

Kafka의 기본 구조 자체가 중복을 허용한다.

```
Consumer 메시지 처리
→ 처리 성공
→ offset commit 전에 장애 발생
→ 재시작 후 같은 메시지 다시 읽음
→ 중복 처리
```

**예시:** 주문 메시지를 받아 결제 처리 중 offset commit 전에 장애 → 재시작 후 동일 메시지 재처리 → 결제가 두 번 나갈 수 있음.

중복이 있는 대신 데이터를 잃지 않으므로, 로그·클릭 이벤트·추천·분석처럼 **중복이 큰 문제가 아닌 대부분의 경우**에 그냥 쓴다.

<br>

## Exactly Once 구현 메커니즘

두 가지를 조합해서 구현한다.

### 1. Idempotent Producer (멱등 프로듀서)

프로듀서에 고유 ID(PID)와 시퀀스 번호를 부여. 브로커가 중복 메시지를 감지해서 한 번만 저장.

```java
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
```

네트워크 재시도로 인한 프로듀서 → 브로커 구간의 중복을 제거한다.

### 2. Transactions (트랜잭션)

여러 토픽/파티션에 걸친 원자적 쓰기. 트랜잭션 커밋 전에는 컨슈머가 메시지를 읽지 않음 (`isolation.level=read_committed`).

```java
producer.initTransactions();
try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("topic-a", key, value));
    producer.send(new ProducerRecord<>("topic-b", key, value));
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

### Kafka Streams에서 EOS

```java
props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);
```

`EXACTLY_ONCE_V2` (Kafka 2.6+) — 각 스트림 태스크가 자체 트랜잭션 프로듀서를 가짐. 이전 `EXACTLY_ONCE`보다 브로커 부하 감소.

<br>

## 언제 Exactly Once를 쓰나

| 써야 하는 경우 | 안 써도 되는 경우 |
|---|---|
| 결제, 정산 | 로그, 클릭 이벤트 |
| 재고 차감 | 추천 시스템 |
| 돈 관련 로직 | 분석 데이터 |

중복이 실제 비즈니스 문제(이중 결제, 재고 오차)가 될 때만 적용한다.

<br>

## ⚠️ 핵심 오해: "Exactly Once 쓰면 중복이 완전히 없나요?"

> **Kafka 내부에서는 보장 가능. 외부 DB/API까지 포함하면 100%는 아니다.**

Kafka Exactly Once는 **Kafka 토픽 간** 이동에서만 보장된다. 컨슈머가 메시지를 읽고 외부 DB에 쓰는 순간, Kafka 트랜잭션 범위 밖이다.

```
Kafka Topic → Consumer → 외부 DB write
                              ↑
                     이 부분은 Kafka EOS 범위 밖
```

그래서 실무에서는 **Kafka EOS + 외부 시스템 멱등성 설계**를 함께 쓴다.

### 멱등성(Idempotency) 설계

같은 요청이 여러 번 와도 결과가 동일하도록 설계하는 것.

```
결제 API: orderId를 유니크 키로 사용
→ 같은 orderId로 두 번 요청이 와도 DB에서 중복 체크
→ 두 번째 요청은 무시 (이미 처리된 것으로 판단)
```

구현 방법:
- DB에 `orderId` unique 제약 + INSERT 시 중복 무시 (`INSERT IGNORE` / `ON CONFLICT DO NOTHING`)
- 처리 결과를 별도 테이블에 기록해두고 재처리 전 조회

**결론:** Kafka EOS는 Kafka 내부 파이프라인을 안전하게 만들고, 멱등성 설계는 외부 시스템까지 커버한다. 둘은 대체재가 아니라 보완재다.

<br>

---

# 🔌 Kafka Connect

## 개념

외부 시스템(DB, S3, Elasticsearch 등)과 Kafka를 연결하는 **데이터 파이프라인 프레임워크**. 커넥터 플러그인만 설정하면 코드 없이 데이터 이동 가능.

```
[MySQL] → Source Connector → [Kafka Topic] → Sink Connector → [Elasticsearch]
```

## Source vs Sink

| 종류 | 방향 | 예시 |
|---|---|---|
| Source Connector | 외부 → Kafka | Debezium(CDC), JDBC Source |
| Sink Connector | Kafka → 외부 | Elasticsearch Sink, S3 Sink |

## CDC (Change Data Capture)

**Debezium**이 대표적인 Source Connector. DB의 바이너리 로그(MySQL binlog, PostgreSQL WAL)를 읽어서 변경 이벤트를 Kafka로 스트리밍.

```json
{
  "name": "mysql-connector",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "localhost",
    "database.port": "3306",
    "database.user": "debezium",
    "database.password": "password",
    "database.server.name": "mydb",
    "table.include.list": "mydb.orders"
  }
}
```

## 배포 모드

**Standalone** — 단일 프로세스. 개발/테스트용.

**Distributed** — 여러 워커로 구성. 프로덕션 환경. 워커 중 하나가 죽으면 다른 워커가 커넥터 태스크를 인수.

## SMT (Single Message Transforms)

커넥터 수준에서 메시지를 변환하는 경량 파이프라인. 간단한 필드 추가/제거/마스킹 등.

```json
"transforms": "addField",
"transforms.addField.type": "org.apache.kafka.connect.transforms.InsertField$Value",
"transforms.addField.static.field": "source",
"transforms.addField.static.value": "mysql"
```

복잡한 변환이 필요하면 SMT 대신 Kafka Streams나 별도 컨슈머 사용.

## Connect vs Streams — 헷갈릴 때

둘 다 Kafka와 데이터를 주고받는데, 역할이 다르다.

> **Connect = 정해진 경로로 데이터를 자동 운반하는 자율주행 로봇**  
> **Streams = 개발자가 직접 운전하는 데이터 처리 엔진**

Connect는 설정만 하면 데이터가 알아서 흐른다. 편하지만 정해진 규칙 안에서만 동작한다. 비즈니스 로직을 넣거나 복잡한 변환을 하려면 Streams나 직접 컨슈머를 써야 한다.

| | Connect | Streams |
|---|---|---|
| 코드 작성 | 불필요 (설정만) | 필요 |
| 역할 | 데이터 이동 | 데이터 처리/변환 |
| 유연성 | 낮음 | 높음 |
| 적합한 경우 | DB → Kafka, Kafka → S3 등 이동 | 필터링, 집계, join, 변환 |

실무에서는 Connect로 데이터를 끌어오고, Streams로 가공한 뒤, 다시 Connect로 내보내는 조합을 쓰는 경우가 많다.

<br>

---

# 💡 전체 그림

```
[외부 DB] 
    → Debezium(Connect) 
    → Kafka Topic (Avro + Schema Registry)
    → Kafka Streams (EOS로 집계/변환)
    → Kafka Topic
    → Elasticsearch Sink(Connect)
    → [검색 엔진]
```

각 컴포넌트가 독립적으로 확장 가능하고, Schema Registry가 데이터 계약을 중앙 관리하는 구조.
