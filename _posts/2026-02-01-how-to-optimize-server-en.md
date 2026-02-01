---
layout: post
title: "Performance Optimization Guide: Improving TPS and Response Time"
date: 2026-02-01
category: Development
#image: assets/img/blog/default.png
author: Lee Sohyun
lang: en
permalink: /en/blog/performance-optimization-guide/
---

<br>

# 📊 Performance Metrics

System performance is generally evaluated using two key metrics.

## Response Time

The time from when a client sends a request until receiving the processing result

## Throughput

TPS (Transactions Per Second): Number of transactions that can be processed per second
- Higher values indicate better capacity to handle more requests

<br>

---

# 🚀 Common Methods to Increase TPS and Their Limitations

## Commonly Attempted Approaches

1. Adding more servers (Scale Out)
2. Increasing thread pool + DB connection pool sizes

## Limitations of These Methods

→ When DB CPU utilization exceeds 70~80%:
- DB query processing time increases
- Overall processing time lengthens
- **TPS actually decreases (counterproductive effect)**

**⇒ Fundamentally, we need to reduce 'processing time' itself**

<br>

---

# ⚡ Methods to Reduce Processing Time

## 1. Database Optimization

### 1-1. Query Tuning

#### Index Optimization
- Apply appropriate indexes to frequently queried columns
    - B-tree: For range searches and sorting
    - Hash: For equality comparisons (=) only
    - Composite Index: When querying multiple columns together

#### Optimize WHERE, JOIN, ORDER BY, GROUP BY Clauses
- Consider indexes for columns used in these clauses
- **Caution**: DB optimizer may ignore indexes and choose Full Scan when query ratio is high
    - Threshold varies by DB (typically 5~15% of total data)

#### Avoid Unnecessary SELECT *
- Explicitly select only needed columns
- Reduces network transmission and improves DB memory efficiency

#### JOIN Optimization

**1. JOIN Order Optimization**
```sql
-- ❌ Wrong: Query large table first
SELECT * 
  FROM orders o  -- 10 million records
  JOIN countries c ON o.country_id = c.id  -- 200 records

-- ✅ Correct: Query small table first
SELECT * 
  FROM countries c  -- 200 records
  JOIN orders o ON c.id = o.country_id  -- 10 million records
```

**Caveats**:
- Modern DBs like PostgreSQL automatically optimize JOIN order, but not perfectly
- Optimization may fail with outdated statistics, functions, subqueries, or CTEs

**2. Existence Checks**
```sql
-- ✅ Use EXISTS: Terminates immediately upon first match
SELECT * 
  FROM users 
 WHERE EXISTS (
  SELECT 1 
    FROM orders 
   WHERE orders.user_id = users.id
);

-- ❌ Using IN: Loads entire subquery result into memory
SELECT * 
  FROM users 
 WHERE id IN (
  SELECT user_id 
    FROM orders
);
```

**⇒ Conclusion: Minimize JOINs, use EXISTS for existence checks, avoid IN when possible**

#### Analyze Execution Plans with EXPLAIN/PROFILE
- Check how queries are executed
- Verify Full Table Scan occurrences
- Confirm index usage

#### Batch Processing
1. **Always** bulk process multiple INSERT, UPDATE, DELETE operations
```sql
-- ❌ Individual processing
INSERT INTO users VALUES (1, 'A');
INSERT INTO users VALUES (2, 'B');

-- ✅ Bulk processing
INSERT INTO users VALUES (1, 'A'), (2, 'B'), (3, 'C');
```

2. Reduce I/O count by grouping transactions

**⇒ Core of DB optimization: Minimize I/O + Reduce CPU burden**

<br>

### 📌 I/O Bound vs CPU Bound Operations

#### What are I/O Bound Operations?
1. Barely use CPU
2. Most time spent waiting for external resources
3. Examples:
    - Network communication
    - Disk read/write
    - DB queries
    - File I/O
    - Waiting for external API responses

**Problem**: Threads are blocked doing nothing while waiting for I/O → Thread resource waste

<br>

### 1-2. Caching

Store data in memory to reduce DB query execution
- Utilize in-memory caches like Redis, Memcached
- Application-level caches (Caffeine, Guava Cache, etc.)

### 1-3. Database Infrastructure Improvements

**Read/Write Splitting**
- Master: Write operations
- Slave (Replica): Read operations
- Distributes traffic to reduce load

**Scale Up**
- Improve hardware specs: CPU, memory, SSD
- Consider cost-effectiveness

### 1-4. Connection Pool Optimization

Optimize connection pool settings for DB, HTTP Client, Redis, etc.
- `maximumPoolSize`: Maximum number of connections
- `minimumIdle`: Minimum idle connections
- `connectionTimeout`: Connection wait time

**Benefits**:
- Prevent excessive connection creation/disposal
- Save CPU and memory
- Maintain stable performance

<br>

## 2. External API Call Optimization

### 2-1. Caching

Cache external API responses that don't change frequently

### 2-2. Remove Synchronous Calls

Asynchronous processing through message queues instead of direct calls
- Utilize Kafka, RabbitMQ, AWS SQS, etc.
- External system failures don't propagate

### 2-3. Asynchronous Processing

**Java Example**:
```java
CompletableFuture.supplyAsync(() -> {
    return externalApiService.call();
});
```

**Important**:
- **Async processing is not for performance improvement, but for request thread protection and isolation**
- Total processing time may actually increase
- Main purpose is improving user experience and system stability

<br>

## 3. Data Aggregation and Calculation Optimization

### Problems with Real-time Calculation

Calculating likes, views, followers, etc. each time:
- Executes complex JOIN or COUNT queries
- Increases DB load
- **Drastically decreases TPS**

### Solutions

#### Pre-Aggregation
```sql
-- ❌ Calculate every time
SELECT COUNT(*) 
  FROM likes 
 WHERE post_id = 123;

-- ✅ Pre-calculate and store
UPDATE posts 
   SET like_count = like_count + 1 
 WHERE id = 123;
```

#### Periodic Aggregation with Batch Jobs
- Process data that doesn't require real-time accuracy in batches
- Example: Recalculate statistics every hour

#### Eventually Consistent Strategy
- Allow slight data inconsistency
- Guarantee consistency eventually
- Example: When 1-2 second delay in like count is acceptable

<br>

---

# ⏱️ Methods to Reduce Waiting Time

**Response Time = Waiting Time + Processing Time**

Waiting time is primarily related to network transmission

## Bandwidth

Maximum amount of data that can be transmitted
- Small bandwidth causes drastically slower transmission speed when concurrent users increase

### Reduce Response Size

**Compression**
```
Content-Encoding: gzip
```
- Compress HTTP response body
- Typically reduces size by 70~90%

**Image Optimization**
- Use WebP format
- Set appropriate resolution and quality
- Apply Lazy Loading

**JSON Response Optimization**
- Remove unnecessary fields
- Simplify data structure

### Separate Traffic

**Utilize CDN (Content Delivery Network)**
- Serve static files (images, CSS, JS) from CDN
- Reduce origin server load
- Serve from edge servers close to users → Reduce latency

**Example**:
```html
<!-- ❌ Serve directly from origin server -->
<img src="/static/images/logo.png">

<!-- ✅ Serve through CDN -->
<img src="https://cdn.example.com/images/logo.png">
```

### Increase Bandwidth

Upgrade instance specifications
- Network bandwidth varies by instance type in AWS EC2
- Example: t3.medium (up to 5 Gbps) → c5n.large (up to 25 Gbps)
- **Downside**: Increased cost

<br>

---

# ✅ Conclusion

Performance optimization requires a multi-layered approach, not simply adding more servers:

## Core Strategies

1. **DB Optimization**: Query tuning, index optimization, I/O minimization
2. **Caching**: Remove unnecessary operations and DB queries
3. **Asynchronous Processing**: Secure thread efficiency and system isolation
4. **Pre-Aggregation**: Use pre-calculated results instead of real-time calculation
5. **Network Optimization**: Compression, CDN, bandwidth management

## Cautions

- **Root cause resolution takes priority** over unconditional scale-out
- Async is not a silver bullet - **use according to purpose**
- Caching must consider **data consistency issues**
- Optimization should be **measurement-based** (no guessing)

By systematically applying these methods, you can build a stable, scalable, high-performance system!