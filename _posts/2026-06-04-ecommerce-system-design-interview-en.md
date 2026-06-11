---
layout: post
title: "Designing an E-Commerce Platform with 1M DAU"
date: 2026-06-04
category: 개발
author: 이소현
description: "Step-by-step backend architecture design for a 1M DAU e-commerce platform: TPS estimation, Redis inventory, Kafka order queue, and idempotency keys"
lang: en
permalink: /en/blog/ecommerce-system-design-interview/
---

<br>

When designing a backend for a large-scale service, the process always starts the same way — with numbers. This post walks through how to approach designing an e-commerce platform (product listing, orders, payments) with 1 million DAU, from traffic estimation to architecture decisions.

<br>

---

## Table of Contents

- [1. Start with Numbers](#section-1)
- [2. Read TPS 2,340 — Can MySQL Handle It?](#section-2)
- [3. Inventory Concurrency — 5,000 People Hit the Buy Button at Once](#section-3)
- [4. Payments — Preventing Double Charges](#section-4)
- [5. Full Architecture](#section-5)
- [Summary](#summary)

---

# 1. Start with Numbers {#section-1}

Design decisions without numbers are just guesses. "Just add caching" means nothing without knowing the actual load.

Assuming each user makes an average of 50 API calls per day (browsing product lists, viewing detail pages, placing orders):

```
DAU: 1,000,000
Total requests/day: 1M × 50 = 50M req/day

Seconds in a day: 86,400
Average TPS: 50M / 86,400 ≈ 578 TPS
Peak TPS (×5): ~2,600–5,800 TPS

Read:Write ratio = 9:1
→ Read TPS: ~2,340 / Write TPS: ~260
```

CCU (Concurrent Users) is typically 10–20% of DAU. At 1M DAU, peak CCU is around 200,000.

The peak multiplier (5×) reflects e-commerce traffic patterns — most shopping happens in the evening. Separating read and write TPS matters because they lead to different architectural decisions.

<br>

---

# 2. Read TPS 2,340 — Can MySQL Handle It? {#section-2}

A single MySQL instance handles roughly 1,000–3,000 TPS depending on query complexity. It may survive normal traffic but risks breaking under peak load.

Product information doesn't change frequently. There's no reason to hit the database every time someone views the same product page. Apply Redis caching.

```
Request → Redis hit  → Response
        → Redis miss → DB query → Store in Redis → Response
```

This is the Cache-Aside (Lazy Loading) pattern — only populate the cache on a miss.

<br>

**What happens when product data is updated?**

Process: **Master DB update → Cache invalidation (delete the key)**

Waiting for Replica sync before invalidating isn't practical — replication is asynchronous and there's no reliable signal from the app layer. Invalidating immediately after the Master write is the standard approach. Note: the first cache miss after invalidation may reload stale data from a Replica that hasn't caught up yet — mitigate with a short TTL.

<br>

**What if a popular cache key expires and thousands of requests hit the DB simultaneously?**

This is the Cache Stampede problem. Two approaches:

- Randomize TTL values to stagger expiration across keys
- Use PER (Probabilistic Early Recomputation) — proactively refresh the cache before it expires

<br>

---

# 3. Inventory Concurrency — 5,000 People Hit the Buy Button at Once {#section-3}

If 5,000 users simultaneously try to buy one of 1,000 available items, naive handling can oversell inventory.

**DB-level approach — SELECT FOR UPDATE**

```sql
BEGIN;
SELECT count FROM coupons WHERE id = 1 FOR UPDATE;
-- if count < 1000:
INSERT INTO user_coupons (user_id, coupon_id) VALUES (?, ?);
UPDATE coupons SET count = count + 1 WHERE id = 1;
COMMIT;
```

Atomic, but 5,000 requests queue up waiting for the lock. Throughput tanks under flash sale conditions.

**Redis-level approach — DECR (recommended)**

```lua
local stock = redis.call('GET', KEYS[1])
if tonumber(stock) > 0 then
    redis.call('DECR', KEYS[1])
    return 1  -- success
else
    return 0  -- out of stock
end
```

Redis lets through exactly 1,000 requests and immediately rejects the other 4,000 before they even reach the DB. No lock contention, much higher throughput.

Add a `(user_id, coupon_id)` unique constraint at the DB level as an additional guard against duplicate issues.

<br>

**How to persist the successful orders to DB?**

It depends on the scale:

**Normal traffic (write TPS ~260):** Direct INSERT. MySQL handles this comfortably.

**Flash sale (write TPS 2,600+):** Publish order events to Kafka, let consumers process them with Bulk INSERT. Kafka tracks offsets so processing resumes exactly where it left off after a crash — no message loss.

Don't reach for Kafka by default. At 1M DAU with 260 write TPS, direct INSERT is sufficient. Kafka makes sense when peak load is extreme or multiple services need to consume the same events.

<br>

---

# 4. Payments — Preventing Double Charges {#section-4}

Network can drop after a payment goes through but before the response is received. The client retries — and potentially charges the user twice.

**Idempotency Key** solves this.

**① Client** — generates UUID per payment attempt → sends in header
```
Idempotency-Key: uuid-abc-123
```

**② Server** — attempts Redis `SET NX` with this key

**② Server** — duplicate prevention

- Redis `SET NX` as a **fast pre-check** (optional — reduces DB load)
- **DB `idempotency_key` unique constraint + store payment result** ← actual guarantee

Flow:
- First request → DB INSERT succeeds → process payment
- Duplicate request → DB INSERT fails (unique violation) → look up stored result → return as-is

Redis is in-memory and can lose data on restart. For payments where durability matters, DB unique constraint is the real safeguard. Redis serves only as a fast pre-filter before the external payment API call.

This is more efficient than DB unique constraints because it intercepts duplicates before making the external payment API call. Holding a lock during an external call (which takes hundreds of milliseconds) is expensive.

<br>

---

# 5. Full Architecture {#section-5}

```
[Client]
    ↓
[CDN]
  └─ static asset caching
    ↓
[API Gateway]
  └─ auth, rate limiting
    ↓
[API Servers (horizontal scale)]
    │
    ├─ Product listing
    │     ↓
    │  [Redis Cache]
    │     ↓ miss
    │  [MySQL Read Replica]
    │
    ├─ Inventory
    │     ↓
    │  [Redis Lua DECR]
    │     ↓ success
    │  [MySQL Primary — direct INSERT]  ← normal traffic (~260 TPS)
    │  [Kafka order event]               ← flash sale (2,600+ TPS)
    │     ↓
    │  [Consumer → MySQL Primary — Bulk INSERT]
    │
    └─ Payment
          ↓
       [Redis SET NX — idempotency check]
          ↓ pass
       [External Payment API]
```

**Read path:** CDN → API Server → Redis → MySQL Read Replica  
**Write path:** API Server → Redis (inventory) → Kafka → MySQL Primary

<br>

---

# Summary {#summary}

| Problem | Solution |
|---|---|
| High read TPS | Redis Cache-Aside |
| Cache stampede | TTL randomization / PER |
| Concurrent inventory deduction | Redis Lua DECR |
| DB write under flash sale | Direct INSERT (normal) / Kafka (peak) |
| Duplicate payments | Idempotency Key + Redis SET NX |

<br>

---

# 📚 References

**System Design / DAU-TPS Estimation**
- Alex Xu, *System Design Interview Vol. 1* (2020), Chapter 1 — Back-of-the-envelope estimation

**Cache-Aside / Caching Strategy**
- [AWS Caching Best Practices](https://aws.amazon.com/caching/best-practices/)
- [Redis Docs: Caching](https://redis.io/docs/manual/patterns/)

**Redis DECR / Inventory Concurrency**
- [Redis DECR Official Docs](https://redis.io/commands/decr/)
- [Redis Lua Scripting](https://redis.io/docs/manual/programmability/lua-api/)

**Kafka Async Orders**
- [Apache Kafka Official Docs](https://kafka.apache.org/documentation/)
- [Confluent: Kafka Use Cases](https://www.confluent.io/use-case/kafka-as-message-queue/)

**Idempotency Key**
- [Stripe API Docs: Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)
- [RFC 7231 Section 4.2.2](https://datatracker.ietf.org/doc/html/rfc7231#section-4.2.2) — HTTP idempotency definition
