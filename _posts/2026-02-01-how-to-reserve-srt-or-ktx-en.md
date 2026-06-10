---
layout: post
title: "SRT/KTX Reservation System Design"
date: 2026-02-01
category: Development
#image: assets/img/blog/default.png
author: Lee Sohyun
description: "System design walkthrough for building an SRT/KTX train reservation system covering concurrency control, queue design, and database schema"
lang: en
permalink: /en/blog/how-to-reserve-srt-or-ktx/
---

<br>

# 🤔 I'm Curious
As someone from the provinces who moved to Seoul,  
I started wondering how the **holiday reservation war** that repeats every Lunar New Year and Chuseok  
actually works internally,  
so I organized this design.

<br>

---

# UI Flow Explanation
1. First, click [Holiday Train Reservation] right at 7 AM
2. Then you enter the queue and can see how many people are waiting ahead of you
3. When your queue number decreases and you get access, you enter a screen where you can search for trains and select seats
4. Then you can reserve a seat
5. At this time, payment is not made immediately but is available on a set date later!

## So let me imagine and explain how it's designed!!

<br>

---

## 1️⃣ Reservation Start – Entering the Queue
At 7 AM, the moment a user clicks the `[Holiday Reservation]` button

- Client → **Redis ZSET-based queue registration**
```redis
ZADD waiting:queue 173820600012 user1
```
- key: waiting:queue
- score: timestamp (entry time)
- value: userId

```java
public void enterQueue(String userId) {
    long now = System.currentTimeMillis();
    jedis.zadd("waiting:queue", now, userId);
}
```


📌 Kafka Event Recording
After Redis processing, produce an event to Kafka.

## Purpose of Use
- Logging / Auditing
    - Who entered the queue and when?
    - Who was issued a token?
- Asynchronous Processing
    - Final DB storage
    - Email / Push notifications
    - External system integration
- Failure Recovery
    - Queue reconstruction based on Kafka logs when Redis fails

Example events: USER_ENTER_QUEUE, TOKEN_ISSUED, USER_ADMITTED

> ⚠️ **If Redis succeeds but Kafka produce fails**: Kafka produce retries via retry policy; if ultimately failed, only the log is lost — the queue itself is correctly registered in Redis, so no service impact. Kafka serves as a **supplementary log/async tool**, not the core flow, so this failure is acceptable.


<br>

---

## 2️⃣ Real-time Queue Position Display
- Check current position by querying Redis ZSET
```redis
ZRANK waiting:queue user1
```

- Read-only → Fast and safe
- Time complexity: O(log N)
- Query interval: 1~3 seconds (polling)
  - With tens of thousands of waiting users, Redis query load increases → Real services should use **WebSocket / SSE + Redis Pub/Sub**
  - Pub/Sub: Server pushes to client only when position changes → Eliminates unnecessary polling

<br>

---

## 3️⃣ Admission Approval & Token Issuance
If the reservation server allows 100 people <br>
Only the top 100 from the Redis queue are allowed entry

```redis
ZRANGE waiting:queue 0 99
```

⚠️ Atomic processing with Lua Script: Process queue removal + token issuance as a single transaction

```lua
if 
  redis.call("ZRANK", queueKey, userId) < limit 
then
  redis.call("ZREM", queueKey, userId)
  redis.call("SET", tokenKey, userId, "EX", 300)
end
```
- No mid-process failure ❌
- No duplicate issuance ❌
- No race conditions ❌

### At this time, why store the token in Redis after issuance?
- Storing tokens in DB causes DB bottleneck with thousands to tens of thousands of requests per second
- Client response example
```json
{
  "accessToken": "abc.def.ghi",
  "expiresIn": 300
}
```

### What if the Redis server goes down — won't tokens be lost?
Yes. Since Redis is in-memory, tokens are lost if the server dies.

Options:
- **Redis Replica + Sentinel**: Automatic failover to Replica on Master failure → data preserved
- **AOF persistence**: With `appendonly yes`, writes are logged to disk → recoverable after restart

That said, queue access tokens are **ephemeral data** — they don't require the strict durability of payments or inventory. If lost, users simply re-enter the queue. In practice, Replica configuration is sufficient.

<br>

---

## 4️⃣ Search API – Token Verification
```pgsql
GET /trains/search?from=Seoul&to=hometown
Authorization: Bearer {queue-access-token}
```
- Redis query:
```redis
GET access:token:abc123
```
- If exists → OK
- If not → 401 / 403

<br>

---

## 5️⃣ Seat Search & Seat Hold

### Seat Search (Cache)
```redis
seat:availability:{trainId}:{date}
```
- Seat status: Available / Hold / Sold

### Seat Hold (Lock)
```redis
SET seat:hold:{trainId}:{seatNo} userId NX EX 180
```
- NX: Fails if seat is already held
- EX 180: Temporary hold for 3 minutes
- Automatically released when TTL expires

### Why Redis?
- Using only DB causes deadlock risk due to row lock contention

<br>

---

## 6️⃣ Payment Stage

- Proceed with payment after seat hold
- Payment involves external PG integration → The slowest section with highest failure probability
- Process after seat hold to distribute traffic

**Seat handling on payment failure**
- Payment fails → Immediately delete Redis seat key (`DEL seat:hold:...`) → Seat becomes available for others
- User abandons mid-payment → Seat automatically released after TTL 180s expires
- Two safety nets (immediate release + TTL) ensure seat inventory accuracy

<br>

---


✅ Conclusion
- At reservation start time, manage user order with Redis ZSET-based queue and <br> record events through Kafka to secure asynchronous processing and failure recovery capability
- At admission approval stage, use Lua Script to atomically process queue removal and token issuance
- Issued Queue Access Token is stored in Redis with TTL-based expiration
- Reservation APIs verify access rights through Redis query for every request
- Seat search uses Redis cache to reduce DB load and <br> solve concurrency issues with NX + TTL-based Redis lock when holding seats
- Payment proceeds after seat hold → Traffic distribution
- Configure a reservation system that operates stably even in super-high-traffic environments like holidays by separating Redis roles into queue, cache, and lock

---

## 🧪 Implementation & Testing

I actually implemented the design described above and conducted load testing using JMeter.

👉 Check out the implementation code and test results in [SRT/KTX Booking System Implementation & JMeter Load Test](/en/blog/train-reservations-jmeter-test/).