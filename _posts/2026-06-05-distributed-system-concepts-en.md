---
layout: post
title: "Problems That Appear When You Scale to Multiple Servers"
date: 2026-06-05
category: 개발
author: 이소현
lang: en
permalink: /en/blog/distributed-system-concepts/
---

<br>

The moment you go from one server to many, a new class of problems appears — session inconsistency, replication lag, race conditions, lock contention. This post covers each problem and how to solve it.

<br>

---

## Table of Contents

- [1. Multiple Servers — Sessions Break](#section-1)
- [2. Read Replica — Data Written a Moment Ago Is Invisible](#section-2)
- [3. Concurrency — 5,000 People Rush for 1,000 Coupons](#section-3)
- [4. Distributed Lock — Multiple Servers Modifying the Same Data](#section-4)
- [Summary](#summary)

---

# 1. Multiple Servers — Sessions Break {#section-1}

A load balancer distributes requests across servers. If user A logs in on server 1 but the next request goes to server 2, server 2 has no record of the login.

**Solution 1 — Sticky Session**

Route the same user's requests to the same server. Simple, but if that server dies, all users pinned to it get logged out.

**Solution 2 — JWT**

Stateless authentication. The client holds the Access Token and sends it in every request header. Any server can validate it without shared state.

<br>

**JWT's weakness — tokens can't be forcibly invalidated**

Once issued, a token is valid until it expires. A stolen token stays live even after the user logs out.

**Access Token + Refresh Token mitigates this.**

- Access Token: short TTL (5–15 minutes)
- Refresh Token: long TTL (7–30 days)

Even if an Access Token is stolen, it expires in 15 minutes. The Refresh Token is server-managed and can be revoked.

<br>

**What if you need to invalidate a stolen Access Token immediately — not wait 15 minutes?**

**Redis blacklist.**

```
Logout → store the Access Token in Redis (TTL = remaining token lifetime)
API request → check Redis blacklist → if found, return 401
```

During normal operation, no Redis lookup is needed — just token validation. The blacklist entry is only added on logout. Redis is in-memory with sub-millisecond response time, so even at high TPS this adds negligible overhead.

<br>

---

# 2. Read Replica — Data Written a Moment Ago Is Invisible {#section-2}

Attaching a Read Replica reduces load on the primary, but data written to the Primary takes time to replicate. This is **Replication Lag**.

**Data that must be read from Primary:**
- Inventory count
- Payment status
- Order details

Reading stale inventory from a Replica could show items as available when they're already sold out. These must always come from Primary.

**Data safe to read from Replica:**
- Product descriptions (rarely updated)
- Comments, like counts
- Popular item rankings

Slight staleness is acceptable here. Since the majority of reads fall into this category, routing them to Replicas significantly reduces Primary load.

<br>

---

# 3. Concurrency — 5,000 People Rush for 1,000 Coupons {#section-3}

When 5,000 users simultaneously request a limited-stock coupon, naive handling can issue more than the limit.

**DB-level — SELECT FOR UPDATE**

```sql
BEGIN;
SELECT count FROM coupons WHERE id = 1 FOR UPDATE;
-- if count < 1000:
INSERT INTO user_coupons (user_id, coupon_id) VALUES (?, ?);
UPDATE coupons SET count = count + 1 WHERE id = 1;
COMMIT;
```

Atomic, but 5,000 requests queue behind the row lock. Throughput collapses under flash sale conditions.

**Redis-level — DECR (recommended)**

```lua
local stock = redis.call('GET', KEYS[1])
if tonumber(stock) > 0 then
    redis.call('DECR', KEYS[1])
    return 1
else
    return 0
end
```

Redis passes exactly 1,000 requests and immediately rejects the other 4,000 before they reach the DB at all. No lock contention, dramatically higher throughput.

Back it with a `(user_id, coupon_id)` unique constraint at the DB level to prevent duplicate issuance.

<br>

---

# 4. Distributed Lock — Multiple Servers Modifying the Same Data {#section-4}

When multiple servers modify the same user's data simultaneously (e.g., point balance), data corruption occurs.

```
Balance: 1,000 pts
Server 1: read(1,000) → charge 500 → write 1,500
Server 2: read(1,000) → charge 500 → write 1,500
Result: charged 1,000 pts total, but balance is 1,500 → 500 pts vanished
```

**Redis distributed lock.**

```
SET lock:point:user123 "server1" NX EX 30
```

`NX` = set only if key doesn't exist (atomic).  
`EX 30` = 30-second TTL.

```
Server 1: SET NX succeeds → acquires lock → processes points → releases lock
Server 2: SET NX fails    → waits or returns error
```

<br>

**What if the server holding the lock crashes?**

The TTL ensures the lock auto-expires after 30 seconds. No permanent deadlock.

**What if the operation takes longer than the TTL?**

Lock renewal (Watchdog). Redisson (Java Redis client) automatically extends the TTL while the operation is still in progress — renewing at 1/3 of the TTL interval.

**What if the Redis server itself crashes?**

In-memory data is lost. Multiple servers could simultaneously acquire the lock.

**Redlock algorithm** addresses this. Run 5 Redis instances and require a majority (3+) to acknowledge the lock before it's considered acquired.

```
Server 1 → attempts SET NX on Redis A, B, C, D, E
A, B, C succeed (majority) → lock acquired
D, E fail → doesn't matter
```

Even if one Redis node dies, the remaining majority keeps the system working correctly.

<br>

---

# Summary {#summary}

| Problem | Solution |
|---|---|
| Session inconsistency across servers | JWT (stateless) |
| Stolen token immediate revocation | Redis blacklist + TTL |
| Replication lag | Read critical data from Primary |
| Concurrent request overflow | Redis DECR + DB unique constraint |
| Concurrent writes to same data | Redis distributed lock (SET NX + TTL) |
| Server dies while holding lock | TTL auto-expiry |
| Operation outlasts TTL | Watchdog lock renewal |
| Redis server dies | Redlock (majority consensus) |

<br>

---

# 📚 References

**Session / JWT**
- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [OWASP: Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

**Redis Blacklist / Token Revocation**
- [Redis SET NX Official Docs](https://redis.io/commands/set/)
- [Redis EXPIRE Official Docs](https://redis.io/commands/expire/)

**Read Replica / Replication Lag**
- [MySQL 8.0 Replication Docs](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
- [AWS RDS Read Replica Docs](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)

**Distributed Lock / Redlock**
- [Redis Distributed Locks (Redlock algorithm)](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Redisson Watchdog](https://github.com/redisson/redisson/wiki/8.-distributed-locks-and-synchronizers)

**Concurrency / SELECT FOR UPDATE**
- [MySQL 8.0 Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
