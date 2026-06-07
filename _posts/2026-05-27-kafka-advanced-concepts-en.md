---
layout: post
title: "Kafka Advanced Concepts: Schema Registry to Exactly Once"
date: 2026-05-27
category: 개발
author: 이소현
lang: en
permalink: /en/blog/kafka-advanced-concepts/
---

<br>

This post assumes familiarity with Kafka basics (topics, partitions, consumer groups) and covers the advanced concepts you'll encounter in real-world systems.

<br>

---

## Table of Contents

- [Schema Registry](#schema-registry)
- [Avro vs Protobuf](#avro-protobuf)
- [Kafka Streams](#kafka-streams)
- [Exactly Once Semantics (EOS)](#eos)
- [Kafka Connect](#kafka-connect)
- [The Full Picture](#full-picture)

---

# 📐 Schema Registry {#schema-registry}

## Why It Exists

Kafka sends messages as raw byte arrays. If a producer changes its data structure, consumers fail to parse. Schema Registry solves this as a **shared contract repository between producers and consumers** — it centralizes schema management, maintains version history, and blocks schema changes that break the contract.

```
Producer ──[register / lookup schema]──► Schema Registry
    │                                        ▲
    │  Schema ID + serialized data           │
    ▼                                        │
[Kafka Topic]                            Consumer
    │                                        │
    └────────────────────────────────────────┘
                   (fetch schema by ID)
```

## How It Works

1. Producer registers schema before sending (returns existing ID if already registered)
2. Message is prefixed with **Magic Byte (1 byte) + Schema ID (4 bytes)**
3. Consumer fetches schema by ID from Registry and deserializes

Kafka message internal structure:

```
[ 0x00 | schemaId=15 | binary data ... ]
  1byte    4bytes        remainder
```

The Magic Byte (`0x00`) identifies the Confluent serialization format. Consumers only need to read the first 5 bytes to know which schema to use.

## Version Management and Compatibility

Schemas are managed by version. When registering a new schema, the Registry automatically validates compatibility against previous versions based on the **compatibility policy** — and rejects registration if the change breaks compatibility.

| Policy | Meaning |
|---|---|
| `BACKWARD` | New schema can read old data (default) |
| `FORWARD` | Old schema can read new data |
| `FULL` | Both directions compatible |
| `NONE` | No compatibility check |

<br>

### BACKWARD (default)

> **"New consumers must be able to read past messages"**

**Allowed:**
- Remove a field (only if it has a default)
- Add a field with a default value

**Not allowed:**
- Add a field without a default (past messages won't have it)
- Change field types

`order-v1.avsc` — current schema

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

`order-v2.avsc` — BACKWARD passes ✅ (new field has `"default"`)

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

`order-v2.avsc` — BACKWARD fails ❌ (no `"default"` → old messages can't be deserialized)

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

**What the developer must do:**
1. Write `order-v2.avsc` — always specify `"default"` for new fields
2. **Deploy consumer first** (it can now understand v2 schema)
3. Deploy producer (starts sending v2 messages)

→ During rolling deploy, old producer messages are still handled by the new consumer.

<br>

### FORWARD

> **"Old consumers must be able to read new messages"**

**Allowed:**
- Add a field without a default (old consumers ignore unknown fields)
- Remove a field that has a default

**Not allowed:**
- Remove a field without a default (old consumers expect it)

`order-v1.avsc` — current schema

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

`order-v2.avsc` — FORWARD passes ✅ (no `"default"` needed — old consumers ignore unknown fields)

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

**What the developer must do:**
1. Write new schema and register in Registry
2. **Deploy producer first** (starts sending v2 messages)
3. Deploy consumer (old version can still handle new messages)

→ Opposite deployment order from BACKWARD.

<br>

### FULL

> **BACKWARD + FORWARD simultaneously**

Most restrictive — intersection of both policies.

**Allowed:**
- Add a field with a default
- Remove a field with a default

**Not allowed:**
- Add/remove a field without a default
- Change field types

FULL passes ✅ — field added with `"default"`

```json
{"name": "currency", "type": "string", "default": "KRW"}
```

FULL fails ❌ — field added without `"default"`

```json
{"name": "currency", "type": "string"}
```

**What the developer must do:**
- `"default"` required on all new fields
- Two-step deploy recommended for removal: add `"default"` first, remove in next deploy
- Deployment order is flexible (consumer or producer can go first)

→ Best when consumer/producer teams deploy independently and can't coordinate order.

<br>

In practice, `BACKWARD` is the default. It pairs naturally with rolling deploys — consumer first, then producer.

<br>

---

# 🗜️ Avro vs Protobuf {#avro-protobuf}

Kafka transmits messages as binary. You need a way to convert **"object → bytes"** — schema-based serialization formats that are faster and smaller than JSON.

**Common ground:**
- Schema definition required
- Faster serialization and smaller payload than JSON
- Version compatibility management built in

<br>

## Avro

The de facto standard in the Confluent ecosystem.

**Characteristics:**
- Schema defined as JSON in `.avsc` files
- Cannot deserialize without schema → tightly coupled with Schema Registry
- Schema evolution (add/remove fields) is natively supported

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

**Pros:** Kafka ecosystem standard, natural Schema Registry integration, strong schema evolution  
**Cons:** Java-centric feel, unreadable without schema file

<br>

## Protobuf

Google's format. Default serialization for gRPC.

**Characteristics:**
- Schema defined in `.proto` files (IDL style)
- **Field number (tag) based** → renaming a field doesn't break compatibility as long as the number stays the same
- Slightly lighter and faster than Avro

```protobuf
// order.proto
syntax = "proto3";

message Order {
  string order_id = 1;
  double amount    = 2;
  string user_id   = 3;  // optional in proto3
}
```

Field numbers are the key. Renaming `order_id` to `orderId` is fine — as long as `= 1` stays the same, old consumers can still read it.

**Pros:** Native gRPC integration, lighter and faster, language-neutral  
**Cons:** Less natural Schema Registry integration, less "standard" in Kafka

<br>

## Comparison

| | Avro | Protobuf |
|---|---|---|
| Kafka standard | ✅ de facto | Less standard |
| Schema Registry | Natural (required) | External config needed (optional) |
| Schema definition | JSON (`.avsc`) | IDL (`.proto`) |
| Compatibility basis | Field name + type | Field number (tag) |
| gRPC | Awkward | ✅ Native |
| Performance | Fast | Slightly faster |

**Rule of thumb:** Kafka-first systems → Avro. Existing gRPC/Protobuf stack → Protobuf.

<br>

---

# 🌊 Kafka Streams {#kafka-streams}

## Overview

Kafka Streams is a **stream processing library** that runs on top of Kafka. No separate cluster (Flink, Spark) needed — runs inside a regular Java application.

## Core Abstractions

All three are confusing at first, but the **"history vs state"** lens makes them clear.

| Type | Core concept | Analogy |
|---|---|---|
| KStream | All events recorded (history) | Chat message log |
| KTable | Current state only | Database table |
| GlobalKTable | Fully replicated reference data | Spreadsheet shared with every employee |

<br>

### KStream — "Event Stream"

> **Each record is an independent event**

The same key arriving multiple times produces multiple independent events. No awareness of past state.

```
orderId=1, price=1000  → event
orderId=2, price=2000  → event
orderId=1, price=1500  → event (new event, not an update to orderId=1)
```

Think of chat messages. The same person sending multiple messages produces multiple independent records — the earlier ones aren't replaced.

<br>

### KTable — "Current State"

> **Same key = only the latest value is kept**

New messages with the same key overwrite the previous value. Only the current state at any moment is preserved.

```
user1 → login   (stored)
user1 → logout  (overwrites)
user1 → login   (overwrites)

Result: user1 = login  ← only latest state remains
```

Behaves like a DB `UPDATE`. Internally backed by a Kafka changelog topic.

<br>

### GlobalKTable — "Fully Replicated KTable"

> **Every instance holds the complete dataset**

A regular KTable is partitioned — a given instance only holds data for its assigned partitions, which causes join failures.

```
KTable (2 partitions):
  Instance A → only partition 0 data
  Instance B → only partition 1 data

→ Instance A trying to join may miss partition 1 data → join fails
```

GlobalKTable replicates all partitions to every instance.

```
GlobalKTable:
  Instance A → full dataset
  Instance B → full dataset

→ Joins always succeed on any instance
```

**When to use:** Small reference data that gets joined frequently (product catalog, code tables). Large datasets incur significant replication cost — use KTable instead.

```java
StreamsBuilder builder = new StreamsBuilder();

KStream<String, Order> orders = builder.stream("orders");
KTable<String, User> users = builder.table("users");

orders
    .join(users, (order, user) -> enrichOrder(order, user))
    .filter((key, enrichedOrder) -> enrichedOrder.getAmount() > 1000)
    .to("high-value-orders");
```

## State Storage

Kafka Streams stores state in **RocksDB** (local disk) and backs it up to an internal changelog topic. On restart, state is restored from the changelog topic.

## Windowing

For time-based aggregations:

| Window type | Characteristics |
|---|---|
| Tumbling | Non-overlapping fixed size (e.g. every 1 minute) |
| Hopping | Overlapping fixed size (e.g. 1-min window, slides every 30s) |
| Session | Dynamic size based on event gaps |

<br>

---

# ✅ Exactly Once Semantics (EOS) {#eos}

> **Default is At-Least-Once. Exactly Once is used only when needed.**

A common misconception is that Exactly Once should always be the goal. The real-world default is At-Least-Once — Exactly Once is only applied where duplicates cause actual business problems.

## Three Delivery Guarantees

| Level | Meaning | Result |
|---|---|---|
| At Most Once | Max 1 delivery (loss possible) | Fast but data can be lost |
| At Least Once | Min 1 delivery (duplicates possible) | **Production default** |
| Exactly Once | Exactly 1 delivery | Safe but complex with overhead |

<br>

## Why At-Least-Once Is the Default

Kafka's fundamental structure allows duplicates.

```
Consumer processes message
→ Processing succeeds
→ Crash before offset commit
→ Restart reads same message again
→ Duplicate processing
```

**Example:** Payment processing crashes after charging but before committing offset → same message reprocessed → customer charged twice.

Since it avoids data loss at the cost of potential duplicates, it's acceptable for most cases like logs, click events, recommendations, and analytics.

<br>

## Exactly Once Implementation

Two mechanisms combined:

### 1. Idempotent Producer

Producer is assigned a unique ID (PID) and sequence number. Broker detects duplicates and stores each message only once.

```java
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
```

Eliminates duplicates in the producer → broker path caused by network retries.

### 2. Transactions

Atomic writes across multiple topics/partitions. Consumers won't read uncommitted messages (`isolation.level=read_committed`).

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

### EOS in Kafka Streams

```java
props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);
```

`EXACTLY_ONCE_V2` (Kafka 2.6+) — each stream task gets its own transactional producer. Lower broker overhead than the previous `EXACTLY_ONCE`.

<br>

## When to Use Exactly Once

| Use it | Skip it |
|---|---|
| Payment, settlement | Logs, click events |
| Inventory deduction | Recommendation systems |
| Money-related logic | Analytics data |

Apply only when duplicates cause real business problems (double charges, inventory discrepancy).

<br>

## ⚠️ Key Misconception: "Does Exactly Once Eliminate All Duplicates?"

> **Guaranteed within Kafka. Not 100% when external DB/API is involved.**

Kafka EOS only covers **Kafka topic-to-topic** transfers. The moment a consumer reads a message and writes to an external DB, it's outside Kafka's transaction scope.

```
Kafka Topic → Consumer → external DB write
                              ↑
                     outside Kafka EOS scope
```

In practice: **Kafka EOS + idempotent design on external systems** are used together.

### Idempotency Design

Design so that the same request arriving multiple times produces the same result.

```
Payment API: use orderId as a unique key
→ Same orderId arrives twice
→ DB checks for existing record
→ Second request is ignored (already processed)
```

Implementation:
- `orderId` unique constraint + `INSERT IGNORE` / `ON CONFLICT DO NOTHING`
- Store processing results in a separate table and check before reprocessing

**Conclusion:** Kafka EOS secures the Kafka pipeline; idempotency design covers external systems. They complement each other — neither replaces the other.

<br>

---

# 🔌 Kafka Connect {#kafka-connect}

## Overview

A **data pipeline framework** that connects external systems (DB, S3, Elasticsearch, etc.) to Kafka. Configure a connector plugin and data moves automatically — no code required.

```
[MySQL]
    ↓
[Source Connector]
    ↓
[Kafka Topic]
    ↓
[Sink Connector]
    ↓
[Elasticsearch]
```

## Source vs Sink

| Type | Direction | Examples |
|---|---|---|
| Source Connector | External → Kafka | Debezium (CDC), JDBC Source |
| Sink Connector | Kafka → External | Elasticsearch Sink, S3 Sink |

## CDC (Change Data Capture)

**Debezium** is the most widely used Source Connector. It reads the DB binary log (MySQL binlog, PostgreSQL WAL) and streams change events to Kafka.

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

## Deployment Modes

**Standalone** — single process. For development/testing.

**Distributed** — multiple workers. Production. If a worker dies, another takes over its connector tasks.

## SMT (Single Message Transforms)

Lightweight message transformation at the connector level. For simple field additions, removals, or masking.

```json
"transforms": "addField",
"transforms.addField.type": "org.apache.kafka.connect.transforms.InsertField$Value",
"transforms.addField.static.field": "source",
"transforms.addField.static.value": "mysql"
```

For complex transformations, use Kafka Streams or a custom consumer instead of SMT.

## Connect vs Streams — When to Use Which

Both interact with Kafka data, but they serve different purposes.

> **Connect = autonomous robot that moves data along a fixed route**  
> **Streams = an engine the developer drives directly**

Connect is configuration-only — data flows automatically within predefined rules. Any business logic or complex transformation requires Streams or a custom consumer.

| | Connect | Streams |
|---|---|---|
| Code required | No (config only) | Yes |
| Role | Data movement | Data processing/transformation |
| Flexibility | Low | High |
| Best for | DB → Kafka, Kafka → S3 | Filter, aggregate, join, transform |

In practice, a common pattern is: Connect pulls data in → Streams processes it → Connect pushes it out.

<br>

---

# 💡 The Full Picture {#full-picture}

```
[External DB]
    → Debezium (Connect)
    → Kafka Topic (Avro + Schema Registry)
    → Kafka Streams (aggregate/transform with EOS)
    → Kafka Topic
    → Elasticsearch Sink (Connect)
    → [Search Engine]
```

Each component scales independently, with Schema Registry managing data contracts centrally.
