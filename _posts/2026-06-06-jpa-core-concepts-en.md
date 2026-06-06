---
layout: post
title: "JPA Core Concepts — Persistence Context to N+1"
date: 2026-06-06
category: 개발
author: 이소현
lang: en
permalink: /en/blog/jpa-core-concepts/
---

<br>

The concepts that trip people up most when moving from MyBatis to JPA — persistence context, dirty checking, N+1, transaction propagation — covered in order.

<br>

---

## Table of Contents

- [Entity Lifecycle: 4 States](#entity-state)
- [Persistence Context and First-Level Cache](#persistence-context)
- [Dirty Checking](#dirty-checking)
- [When Does Flush Happen?](#flush)
- [N+1 Problem](#n-plus-one)
- [@Transactional](#transactional)
- [cascade / orphanRemoval](#cascade)
- [Quick Reference](#summary)
- [References](#references)

---

# 🗂️ Entity Lifecycle: 4 States {#entity-state}

Every JPA entity is always in one of four states.

```java
User user = new User("Sohyeon");  // Transient — JPA doesn't know about it

em.persist(user);   // Managed — registered in first-level cache

em.detach(user);    // Detached — removed from cache, no longer tracked
                    // also happens when the transaction ends

em.remove(user);    // Removed — DELETE query issued on commit
```

| State | Description |
|---|---|
| Transient (new) | Created with `new`, JPA unaware |
| Managed | In first-level cache via `persist()` or `find()` |
| Detached | Was managed, now separated — dirty checking disabled |
| Removed | `remove()` called, DELETE on commit |

**Detached gotcha:** Modifying a detached entity's fields produces no UPDATE query.

<br>

---

# 🏪 Persistence Context and First-Level Cache {#persistence-context}

The persistence context is the logical store where JPA manages entities. It's controlled by the `EntityManager` and lives and dies with the transaction.

The first-level cache is an internal Map:

```
key:   @Id (identifier)
value: entity instance
```

```java
em.find(User.class, 1L);  // DB query → stored in first-level cache
em.find(User.class, 1L);  // cache hit → no DB query (only 1 query total)
```

**Important:** The first-level cache is transaction-scoped — not application-level like Redis. It disappears when the transaction ends.

A `@Entity` without `@Id` causes a runtime `AnnotationException` — there's no key for the first-level cache.

<br>

---

# 🔍 Dirty Checking {#dirty-checking}

Modifying a managed entity automatically triggers an UPDATE — no need to call `em.update()`.

```java
@Transactional
public void update() {
    User user = em.find(User.class, 1L);  // managed + snapshot saved
    user.setName("Sohyeon Kim");          // just a setter call
}
// transaction ends → flush → compare against snapshot → UPDATE fired automatically
```

**Snapshot:** When an entity enters the first-level cache, a copy of its original state is saved alongside it. At flush time, JPA compares the current entity against the snapshot and generates UPDATE SQL for any changed fields.

Dirty checking does not work on detached entities.

<br>

---

# ⏱️ When Does Flush Happen? {#flush}

Flush = sending the first-level cache's pending changes to the DB as SQL. Not a commit — just SQL transmission.

**3 triggers:**

1. `em.flush()` called explicitly
2. Transaction commit — auto-flushes before committing
3. JPQL query execution — prevents inconsistency between cache and DB

```java
@Transactional
public void example() {
    User user = em.find(User.class, 1L);
    user.setName("Sohyeon Kim");  // pending, not flushed yet

    // JPQL execution → auto-flush fires first → UPDATE goes out
    List<User> users = em.createQuery("SELECT u FROM User u").getResultList();
    // the updated data is visible in the result
}
// method returns → transaction commits → flush + commit
```

Without `@Transactional`, auto-flush never fires. Write operations missing `@Transactional` won't be persisted.

<br>

---

# ⚠️ N+1 Problem {#n-plus-one}

**N+1 = 1 query for the parent + N queries for associated entities (one per parent)**

```java
@Entity
public class User {
    @OneToMany(mappedBy = "user", fetch = FetchType.LAZY)
    List<Order> orders;
}

List<User> users = userRepository.findAll();  // SELECT * FROM user → 1 query

for (User user : users) {
    user.getOrders();  // SELECT * FROM orders WHERE user_id=? → 100 queries
}
// Total: 1 + 100 = N+1
```

N+1 doesn't fire during `findAll()` itself — it fires **the moment associated entities are accessed**. It affects `List` relationships as well as single-entity `@ManyToOne` and `@OneToOne`. It commonly surfaces during JSON serialization even when service code looks fine.

**Switching to EAGER doesn't fix it** — same number of queries, just different timing. EAGER is worse because it always fetches associations even when they're not needed.

<br>

**Three solutions:**

**1. Fetch Join (JPQL)**
```java
@Query("SELECT u FROM User u JOIN FETCH u.orders")
List<User> findAllWithOrders();
// User + orders fetched in one JOIN → 1 query
```

**2. @EntityGraph**
```java
@EntityGraph(attributePaths = {"orders"})
List<User> findAll();
// same behavior as fetch join, declared as an annotation
```

**3. Batch Size**
```java
@BatchSize(size = 100)
List<Order> orders;
// or application.yml:
// spring.jpa.properties.hibernate.default_batch_fetch_size: 100
```

```
Before: SELECT * FROM orders WHERE user_id=1  (100 times)
After:  SELECT * FROM orders WHERE user_id IN (1,2,...100)  (1 time)
```

On the first `getOrders()` call, Hibernate fetches orders for all 100 users at once using an `IN` clause. Subsequent calls hit the cache.

**In practice:** Set `default_batch_fetch_size` globally, use fetch join only where needed.

<br>

---

# 🔒 @Transactional {#transactional}

**readOnly = true**

```java
@Transactional(readOnly = true)
public List<User> findAll() { ... }
```

- No DB write locks
- JPA skips snapshot creation → no dirty checking → less memory and CPU
- Can enable automatic routing to Read Replica

Skipping snapshots for 100,000 entities is a meaningful performance gain.

<br>

**Propagation**

| Option | Behavior |
|---|---|
| `REQUIRED` (default) | Join existing transaction; create one if none exists |
| `REQUIRES_NEW` | Suspend current transaction; always create a new one |
| `SUPPORTS` | Join if exists; run without transaction if not |

```java
@Transactional
public void order() {
    orderService.createOrder();  // joins transaction A
    logService.saveLog();        // REQUIRES_NEW → separate transaction B
}
// if A rolls back, B is already committed → failure log is preserved
```

<br>

**The internal call trap**

`@Transactional` works through an AOP proxy. Calling an annotated method from within the same class bypasses the proxy — `@Transactional` is silently ignored.

```java
public void order() {
    this.createOrder();  // internal call → no proxy → @Transactional ignored
}

@Transactional
public void createOrder() { ... }
```

Fix: extract `createOrder()` into a separate class.

<br>

---

# 🌊 cascade / orphanRemoval {#cascade}

**cascade** = propagate parent entity operations to children.

```java
@OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
List<Order> orders;

em.persist(user);  // saves user + automatically saves orders
em.remove(user);   // deletes user + automatically deletes orders
```

**orphanRemoval = true** = automatically delete children that lose their association with the parent.

```java
user.getOrders().remove(order);  // removing from the list triggers DB DELETE
```

**Difference:**

| | cascade REMOVE | orphanRemoval |
|---|---|---|
| Trigger | Parent deleted (`em.remove(parent)`) | Parent-child relationship severed (`list.remove(child)`) |

Typically used together: `cascade = ALL + orphanRemoval = true`. Do not use cascade ALL if a child entity can be associated with multiple different parents — you'll get unintended deletes.

<br>

---

# 💡 Quick Reference {#summary}

| Topic | Key Point |
|---|---|
| Persistence context | Transaction-scoped entity store; first-level cache = Map(id, entity) |
| Entity states | Transient→Managed→Detached→Removed; detached disables dirty checking |
| Dirty checking | Snapshot comparison triggers auto-UPDATE; requires @Transactional |
| Flush | em.flush() / transaction commit / before JPQL execution |
| N+1 | LAZY + loop access; EAGER doesn't fix it |
| N+1 solutions | Fetch join / @EntityGraph / BatchSize |
| @Transactional readOnly | Skips snapshots → skips dirty checking → performance gain |
| REQUIRES_NEW propagation | Separate transaction — survives parent rollback |
| Internal call trap | Proxy bypassed → @Transactional ignored → extract to separate class |
| cascade ALL | Only for parent-child with identical lifecycle |
| orphanRemoval | Auto-DELETE when relationship is severed |

<br>

---

# 📚 References {#references}

**JPA Specification**
- [Jakarta Persistence 3.1 Spec](https://jakarta.ee/specifications/persistence/3.1/)
- [Hibernate ORM Official Docs](https://docs.jboss.org/hibernate/orm/6.0/userguide/html_single/Hibernate_User_Guide.html)

**N+1 / Performance**
- [Hibernate: Fetching Strategies](https://docs.jboss.org/hibernate/orm/6.0/userguide/html_single/Hibernate_User_Guide.html#fetching)
- [Spring Data JPA: @EntityGraph](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#jpa.entity-graph)

**@Transactional**
- [Spring Framework: Transaction Management](https://docs.spring.io/spring-framework/docs/current/reference/html/data-access.html#transaction)
- 김영한, *자바 ORM 표준 JPA 프로그래밍* (2015)
