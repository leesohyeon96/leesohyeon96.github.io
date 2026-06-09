---
layout: post
title: "Java Data Structures & Concurrency: Core Concepts for Backend Interviews"
date: 2026-06-06
category: 개발
author: 이소현
description: "Key Java data structures (ArrayList, HashMap, LinkedList) and concurrency concepts (synchronized, volatile, ConcurrentHashMap) for backend interviews"
lang: en
permalink: /en/blog/java-data-structures-and-concurrency/
---

<br>

From B+Tree and Red-Black Tree internals to multi-threaded concurrency control — a deep dive into the data structure and concurrency concepts that appear regularly in backend engineering interviews.

<br>

---

## Table of Contents

- [B-Tree vs B+Tree](#b-tree)
- [Red-Black Tree](#rbt)
- [HashMap Internals](#hashmap)
- [Key Collections Compared](#collections)
- [Java Concurrency](#concurrency)
- [Quick Reference](#summary)
- [References](#references)

---

# 🌳 B-Tree vs B+Tree {#b-tree}

**Why does MySQL InnoDB use B+Tree instead of B-Tree?**

Both are balanced trees, but their internal node structure differs.

```
B-Tree:  internal node = [key | data | key | data | ...]
B+Tree:  internal node = [key | key | key | ...]   ← no data, keys only
         leaf node     = [key | data] → [key | data] → [key | data]
```

B+Tree's internal nodes store only keys, so a single disk page (16KB) can hold far more keys. More keys per node means a shallower tree, which means fewer disk I/O operations to traverse from root to leaf.

Leaf nodes are connected as a linked list, making range queries (`BETWEEN`, `>=`, `ORDER BY`) efficient — no need to traverse back up the tree.

**Two key advantages:**
- Higher fan-out → lower tree height → fewer I/Os on point queries
- Leaf linked list → no re-traversal needed for range queries

<br>

---

# 🔴 Red-Black Tree {#rbt}

**Where is Red-Black Tree used in practice, and why choose it over AVL Tree?**

Both are self-balancing binary search trees, but with different balancing constraints.

| | AVL | Red-Black Tree |
|---|---|---|
| Balance constraint | Strict (height diff ≤ 1) | Relaxed (longest path ≤ 2× shortest) |
| Search | Faster | Slightly slower |
| Insert/Delete | More rotations | Fewer rotations |
| Best for | Read-heavy | Write-heavy |

General-purpose data structures like Map/Set involve frequent inserts and deletes, making Red-Black Tree the natural choice.

**Real-world usage:**
- Java `TreeMap`, `TreeSet`
- Java `HashMap` — Java 8+ converts bucket linked lists to RBT when bucket size exceeds 8
- Linux CFS scheduler (process priority management)
- C++ STL `std::map`, `std::set`

<br>

---

# 🗂️ HashMap Internals {#hashmap}

**What happens when a hash collision occurs in HashMap?**

HashMap uses **Separate Chaining** — collisions are stored as a linked list within the same bucket.

```
bucket[3] → [key=A, val=1] → [key=B, val=2] → null
```

Java 8 changed the worst-case performance:

| | Before Java 8 | Java 8+ |
|---|---|---|
| Bucket structure | LinkedList | LinkedList → RBT (when > 8 entries) |
| Worst-case complexity | O(n) | O(log n) |

```java
static final int TREEIFY_THRESHOLD = 8;   // LinkedList → RBT
static final int UNTREEIFY_THRESHOLD = 6; // RBT → LinkedList (prevents thrashing)
```

Below 8 entries, RBT overhead (pointers, color bits, rotations) outweighs the benefit — LinkedList is faster for small sizes. The threshold of 8 is statistically grounded: with a good hash function, the probability of any bucket exceeding 8 entries follows a Poisson distribution with probability ~0.00000006.

**HashMap complexity:**

| State | Complexity |
|---|---|
| No collision | O(1) |
| Collision, Java 8+ (> 8 entries) | O(log n) |
| Collision, pre-Java 8 | O(n) |

<br>

**Why must `equals()` and `hashCode()` be overridden together?**

HashMap key lookup is a two-step process:

```
1. hashCode() → find the bucket
2. equals()   → identify the exact key within the bucket
```

Override only `hashCode()`, skip `equals()`:

```java
map.get(u2):
1. u2.hashCode() → finds the correct bucket ✅
2. u1.equals(u2) → Object default = reference comparison → false ❌
3. returns null
```

Override only `equals()`, skip `hashCode()`:

```java
map.get(u2):
1. u2.hashCode() → address-based value → wrong bucket ❌
2. bucket not found
3. returns null
```

**Rule: if `equals()` returns true, `hashCode()` must return the same value.**

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof User)) return false;
    User u = (User) o;
    return age == u.age && Objects.equals(name, u.name);
}

@Override
public int hashCode() {
    return Objects.hash(name, age);
}
```

<br>

---

# 📋 Key Collections Compared {#collections}

**PriorityQueue: internal structure and complexity?**

PriorityQueue is implemented as a **Min-Heap (complete binary tree)**. The minimum value is always at the root, stored internally as an array.

```
      1
    /   \
   3     2
  / \   /
 7   4  5

Array: [1, 3, 2, 7, 4, 5]
Parent i → left child 2i+1, right child 2i+2
```

| Operation | Complexity |
|---|---|
| offer() (insert) | O(log n) |
| poll() (remove min) | O(log n) |
| peek() (read min) | O(1) |

Insert/remove require heapify (comparing up or down the tree) → O(log n).

<br>

**ArrayList vs LinkedList?**

| Operation | ArrayList | LinkedList |
|---|---|---|
| Access by index | O(1) | O(n) |
| Insert/Delete (middle) | O(n) | O(1) |
| Insert/Delete (end) | O(1) amortized | O(1) |

ArrayList is array-backed — index access is direct, O(1). Middle insert/delete requires shifting all subsequent elements → O(n).

LinkedList insert/delete is O(1) in isolation, but traversal to the target node is O(n) — traversal is always the bottleneck. In practice, LinkedList is rarely used; ArrayList covers most cases.

<br>

**Why use Deque instead of Stack in Java?**

The `Stack` class extends `Vector`, which adds `synchronized` to every method. This incurs unnecessary synchronization overhead even in single-threaded contexts.

- Single-threaded → `ArrayDeque`
- Multi-threaded → `ConcurrentLinkedDeque` or `LinkedBlockingDeque`

There is no situation where `Stack` is the right choice.

<br>

---

# 🔒 Java Concurrency {#concurrency}

**What happens when HashMap is used in a multi-threaded environment?**

Race conditions occur.

```
Initial: count = 0

Thread A: get("count") → reads 0
Thread B: get("count") → reads 0  ← A hasn't written yet

Thread A: 0 + 1 = 1 → put
Thread B: 0 + 1 = 1 → put

Result: count = 1  (should be 2 — data lost)
```

Concurrent rehashing can also corrupt the internal structure.

**Solutions:**

```java
// 1. ConcurrentHashMap — bucket-level locking, good performance
Map<String, Integer> map = new ConcurrentHashMap<>();

// 2. synchronized block — full map lock, poor performance
synchronized(map) { map.put(...); }

// 3. Collections.synchronizedMap — similar to synchronized block
Map<String, Integer> map = Collections.synchronizedMap(new HashMap<>());
```

**Why ConcurrentHashMap outperforms Hashtable:**

- Hashtable: `synchronized` on every method → full map lock, only 1 thread at a time
- ConcurrentHashMap: bucket-level locking → threads can access different buckets concurrently → much higher throughput

<br>

**What does `volatile` do?**

Each thread runs on a CPU core and, for performance, copies variables into the core's local cache. Since each core has its own cache, a change written by one thread may not be visible to another thread reading from its own cache (Visibility Problem).

`volatile` forces the variable to always be read from and written to main memory directly — bypassing the cache. All threads see the same value at all times.

However, `volatile` **only guarantees visibility** — it does not prevent race conditions.

```java
volatile int count = 0;
count++;  // still a race condition — read/modify/write is not atomic
```

Use `AtomicInteger` for counters.

<br>

**How does AtomicInteger prevent race conditions?**

**CAS (Compare-And-Swap)** — atomic operations without locks.

```java
// internal behavior (pseudocode)
do {
    expected = count.get();      // read current value
    newVal = expected + 1;
} while (!compareAndSwap(expected, newVal));  // retry until success
```

The value is updated only if memory still holds the expected value. If another thread changed it in between, retry. Executed as a single CPU instruction — atomically.

| | synchronized | AtomicInteger |
|---|---|---|
| Mechanism | lock + block | CAS retry (non-blocking) |
| Low contention | Slower | Faster |
| High contention | Blocked threads don't burn CPU | Retries burn CPU |

Under extremely heavy write contention, `LongAdder` can outperform `AtomicInteger` — it maintains per-thread cells that are summed on read, minimizing CAS conflicts.

<br>

**What is a deadlock, and how do you prevent it?**

Two threads waiting for each other's resources indefinitely.

```
Thread A: holds lock1 → waiting for lock2
Thread B: holds lock2 → waiting for lock1
→ neither can proceed
```

**Prevention:**

```java
// 1. Consistent lock ordering
// All threads always acquire lockA before lockB → no circular wait

// 2. tryLock with timeout
if (lock.tryLock(1, TimeUnit.SECONDS)) {
    // success
} else {
    // give up → breaks the deadlock
}
```

3. Minimize lock scope — avoid holding two locks simultaneously by design.

DB deadlocks are detected by the DB engine, which forcibly rolls back one transaction.

<br>

**What is ThreadLocal, and where is it used?**

ThreadLocal provides each thread with its own independent copy of a variable. The same variable holds different values per thread, with no cross-thread interference.

```java
ThreadLocal<String> userId = new ThreadLocal<>();

// Thread A
userId.set("user123");

// Thread B
userId.set("user456");

// Thread A reads
userId.get();  // "user123" — Thread B's value is invisible
```

**Used in Spring:**

- `SecurityContextHolder` — stores the logged-in user per request thread
- `@Transactional` — stores the DB connection in ThreadLocal for sharing within the same thread
- MDC — automatically attaches traceId/userId to all log lines

**Important:** Thread pools reuse threads. Always call `remove()` after the request is done — failing to do so leaks the previous request's data into the next.

```java
try {
    userId.set("user123");
    // ...
} finally {
    userId.remove();
}
```

**MDC (Mapped Diagnostic Context):**

MDC uses ThreadLocal internally. Configure the logback pattern with `%X{traceId}` and every log line automatically includes whatever is in MDC.

```java
// In a Filter (before Spring MVC)
MDC.put("traceId", UUID.randomUUID().toString());

// Anywhere in the codebase
log.info("Processing order");
// Output: [traceId=abc-123] Processing order
```

Set MDC in a Filter (not an Interceptor) so that logs from the Filter → DispatcherServlet path also carry the traceId.

In microservices, pass the traceId as an HTTP header between services. Each service reads the header and sets it in MDC. Searching by traceId in Kibana lets you trace the full request journey across services.

<br>

---

# 💡 Quick Reference {#summary}

| Topic | Key Point |
|---|---|
| B+Tree vs B-Tree | Keys-only internal nodes → higher fan-out → lower height, leaf linked list → range scan |
| Red-Black Tree | Relaxed balance for insert/delete, used in TreeMap and HashMap buckets |
| HashMap collision | Separate Chaining, Java 8+ converts to RBT when bucket size > 8: O(n) → O(log n) |
| equals + hashCode | Both must be overridden; rule: equals true → hashCode must be equal |
| PriorityQueue | Min-Heap, insert/remove O(log n) |
| ArrayList vs LinkedList | Index access O(1) vs O(n), use ArrayList in practice |
| Deque | Replaces Stack, ArrayDeque for single-threaded use |
| ConcurrentHashMap | Bucket-level locking, outperforms Hashtable's full-map lock |
| volatile | Visibility guarantee (reads from main memory), does not prevent race conditions |
| AtomicInteger | CAS non-blocking atomic ops, faster than synchronized under low contention |
| ThreadLocal | Per-thread independent storage, always call remove() |
| MDC | ThreadLocal-backed, auto-attaches fields to all log lines |

<br>

---

# 📚 References {#references}

**B+Tree / B-Tree**
- [MySQL 8.0 InnoDB On-Disk Structures](https://dev.mysql.com/doc/refman/8.0/en/innodb-physical-structure.html)
- Alex Petrov, *Database Internals* (2019), Chapter 3 — B-Tree Variants

**HashMap Java 8 Improvements**
- [JEP 180: Handle Frequent HashMap Collisions with Balanced Trees](https://openjdk.org/jeps/180)
- [OpenJDK HashMap.java source](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java)

**Red-Black Tree**
- Thomas H. Cormen et al., *Introduction to Algorithms* (CLRS), Chapter 13
- [OpenJDK TreeMap.java source](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/TreeMap.java)

**Java Concurrency (volatile, AtomicInteger, ConcurrentHashMap)**
- Brian Goetz et al., *Java Concurrency in Practice* (2006)
- [JSR-133: Java Memory Model](https://www.cs.umd.edu/~pugh/java/memoryModel/jsr133.pdf)
- [Java 8 ConcurrentHashMap source](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ConcurrentHashMap.java)

**ThreadLocal / MDC**
- [Java ThreadLocal Javadoc](https://docs.oracle.com/en/java/docs/api/java.base/java/lang/ThreadLocal.html)
- [Logback MDC Docs](https://logback.qos.ch/manual/mdc.html)
