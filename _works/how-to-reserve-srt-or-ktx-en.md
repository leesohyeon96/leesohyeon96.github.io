# 🤔 How Does Holiday Ticket Booking Actually Work?
As someone who moved to Seoul from a regional area,  
I always wondered how **holiday ticket booking systems** survive the massive traffic during Lunar New Year and Chuseok.

This post is a simplified system design walkthrough.

---

# 🛠️ System Design Overview

## 1️⃣ Queue Entry
At 7:00 AM, when the user clicks `[Holiday Booking]`

- Client → Redis ZSET queue
```redis
ZADD waiting:queue 173820600012 user1
score: entry timestamp

value: userId

Kafka is used to record events for:

logging & auditing

async processing

disaster recovery

2️⃣ Real-time Queue Position
ZRANK waiting:queue user1
Read-only

Fast (O(log N))

Polled every 1–3 seconds

3️⃣ Admission & Token Issuance
Only the top N users (e.g. 100) are allowed to enter.

Lua Script ensures atomicity:

if redis.call("ZRANK", queueKey, userId) < limit then
   redis.call("ZREM", queueKey, userId)
   redis.call("SET", tokenKey, userId, "EX", 300)
end
No race condition

No duplicate tokens

No partial failures

4️⃣ Token Validation
GET /trains/search
Authorization: Bearer {queue-access-token}
GET access:token:abc123
5️⃣ Seat Lookup & Reservation
Seat Availability (Cache)
seat:availability:{trainId}:{date}
Seat Hold (Lock)
SET seat:hold:{trainId}:{seatNo} userId NX EX 180
Prevents double booking

TTL automatically releases seats

6️⃣ Payment
Executed after seat hold

External PG integration

Slowest and most failure-prone step

Helps distribute traffic load

✅ Conclusion
Redis ZSET is used for queue management

Lua Script ensures atomic admission control

Redis acts as queue, cache, and distributed lock

Kafka provides durability and recovery

This architecture enables stable operation under massive traffic spikes

A practical and battle-tested design for high-traffic booking systems.