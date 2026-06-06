---
layout: post
title: "JPA 핵심 개념 정리 — 영속성 컨텍스트부터 N+1까지"
date: 2026-06-06
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/jpa-core-concepts/
---

<br>

MyBatis에서 JPA로 넘어올 때 가장 헷갈리는 부분들 — 영속성 컨텍스트, dirty checking, N+1, 트랜잭션 전파 — 을 순서대로 정리했다.

<br>

---

## 목차

- [엔티티 상태 4가지](#entity-state)
- [영속성 컨텍스트와 1차 캐시](#persistence-context)
- [dirty checking (변경 감지)](#dirty-checking)
- [flush 발생 시점](#flush)
- [N+1 문제](#n-plus-one)
- [@Transactional](#transactional)
- [cascade / orphanRemoval](#cascade)
- [한눈에 정리](#summary)
- [참고 자료](#references)

---

# 🗂️ 엔티티 상태 4가지 {#entity-state}

JPA 엔티티는 항상 4가지 상태 중 하나에 있다.

```java
User user = new User("이소현");  // 비영속 — JPA가 모름

em.persist(user);   // 영속 — 1차 캐시에 등록, managed

em.detach(user);    // 준영속 — 1차 캐시에서 분리, dirty checking 안 됨
                    // 트랜잭션 끝나도 준영속 됨

em.remove(user);    // 삭제 — 커밋 시 DELETE 쿼리 나감
```

| 상태 | 설명 |
|---|---|
| 비영속 (new) | `new`로 생성만 한 상태, JPA 관리 X |
| 영속 (managed) | `persist()` 또는 `find()`로 1차 캐시에 등록 |
| 준영속 (detached) | 영속이었다가 분리, dirty checking 안 됨 |
| 삭제 (removed) | `remove()` 호출, 커밋 시 DELETE |

**준영속 주의:** 준영속 상태에서 필드를 바꿔도 UPDATE 쿼리가 나가지 않는다.

<br>

---

# 🏪 영속성 컨텍스트와 1차 캐시 {#persistence-context}

영속성 컨텍스트는 엔티티를 관리하는 논리적인 저장소다. `EntityManager`가 관리하며 트랜잭션 단위로 살고 죽는다.

1차 캐시는 내부적으로 Map 구조다.

```
key:   @Id (식별자)
value: 엔티티 인스턴스
```

```java
em.find(User.class, 1L);  // DB 조회 → 1차 캐시 저장
em.find(User.class, 1L);  // 1차 캐시 hit → DB 안 감 (쿼리 1번만 나감)
```

**중요:** 1차 캐시는 트랜잭션 단위. Redis 같은 애플리케이션 레벨 캐시와 다르다. 트랜잭션이 끝나면 1차 캐시도 사라진다.

`@Entity`에 `@Id`가 없으면 1차 캐시 키가 없어서 런타임 `AnnotationException` 발생.

<br>

---

# 🔍 dirty checking (변경 감지) {#dirty-checking}

영속 상태의 엔티티를 수정하면 `em.update()` 없이 자동으로 UPDATE가 나간다.

```java
@Transactional
public void update() {
    User user = em.find(User.class, 1L);  // 영속 상태 + 스냅샷 저장
    user.setName("김소현");               // setter만 호출
}
// 트랜잭션 끝 → flush → 스냅샷과 비교 → UPDATE 자동 발생
```

**스냅샷:** 엔티티를 1차 캐시에 넣을 때 원본 복사본도 함께 저장. flush 시 현재 엔티티와 스냅샷 비교 → 변경된 필드만 UPDATE.

준영속 상태에서는 dirty checking이 동작하지 않는다.

<br>

---

# ⏱️ flush 발생 시점 {#flush}

flush = 1차 캐시의 변경사항을 DB에 SQL로 전송하는 것. commit이 아니라 SQL 전송만.

**3가지 시점:**

1. `em.flush()` 직접 호출
2. 트랜잭션 커밋 시 — 자동으로 flush 후 commit
3. JPQL 쿼리 실행 직전 — 1차 캐시와 DB 불일치 방지

```java
@Transactional
public void example() {
    User user = em.find(User.class, 1L);
    user.setName("김소현");  // 아직 flush 안 됨

    // JPQL 실행 직전 자동 flush → UPDATE 먼저 나감
    List<User> users = em.createQuery("SELECT u FROM User u").getResultList();
    // 변경된 데이터가 조회됨
}
// 메서드 끝 → 트랜잭션 커밋 → flush + commit
```

`@Transactional` 없으면 자동 flush가 발생하지 않는다. 쓰기 작업에 `@Transactional`이 없으면 DB에 반영이 안 된다.

<br>

---

# ⚠️ N+1 문제 {#n-plus-one}

**N+1 = 상위 쿼리 1번 + 연관 엔티티 쿼리 N번**

```java
@Entity
public class User {
    @OneToMany(mappedBy = "user", fetch = FetchType.LAZY)
    List<Order> orders;
}

List<User> users = userRepository.findAll();  // SELECT * FROM user → 1번

for (User user : users) {
    user.getOrders();  // SELECT * FROM orders WHERE user_id=? → 100번
}
// 총 101번 쿼리 (1 + N)
```

`findAll()` 자체에서 발생하는 게 아니라 **연관 엔티티에 접근하는 순간** 발생한다. `List`뿐 아니라 `@ManyToOne`, `@OneToOne` 단건도 마찬가지다. JSON 직렬화 시점에 터지는 경우도 많다.

**EAGER로 바꿔도 해결 안 된다** — 타이밍만 다를 뿐 쿼리 수는 똑같다. 오히려 필요 없는 데이터도 항상 가져와서 더 나쁘다.

<br>

**해결책 3가지:**

**1. Fetch Join (JPQL)**
```java
@Query("SELECT u FROM User u JOIN FETCH u.orders")
List<User> findAllWithOrders();
// User + orders 한 번에 JOIN → 쿼리 1번
```

**2. @EntityGraph**
```java
@EntityGraph(attributePaths = {"orders"})
List<User> findAll();
// fetch join과 동작 동일, 어노테이션으로 선언
```

**3. Batch Size**
```java
@BatchSize(size = 100)
List<Order> orders;
// 또는 application.yml
// spring.jpa.properties.hibernate.default_batch_fetch_size: 100
```

```
기존: SELECT * FROM orders WHERE user_id=1  (100번)
BatchSize: SELECT * FROM orders WHERE user_id IN (1,2,...100)  (1번)
```

첫 번째 `getOrders()` 호출 시 나머지 99명 것도 IN으로 묶어서 한 번에 가져온다.

**실무:** `default_batch_fetch_size` 전역 설정 + 필요한 곳만 fetch join.

<br>

---

# 🔒 @Transactional {#transactional}

**readOnly = true**

```java
@Transactional(readOnly = true)
public List<User> findAll() { ... }
```

- DB 락 안 걸음
- JPA 스냅샷 저장 안 함 → dirty checking 안 함 → 메모리/CPU 절약
- Read Replica 라우팅 가능

엔티티 10만 건 조회 시 스냅샷 10만 개를 만들지 않아도 되는 게 실질적인 성능 차이.

<br>

**전파(Propagation)**

| 옵션 | 동작 |
|---|---|
| `REQUIRED` (기본) | 기존 트랜잭션 참여, 없으면 새로 생성 |
| `REQUIRES_NEW` | 기존 트랜잭션 중단, 무조건 새 트랜잭션 |
| `SUPPORTS` | 있으면 참여, 없으면 트랜잭션 없이 실행 |

```java
@Transactional
public void order() {
    orderService.createOrder();  // 트랜잭션 A 참여
    logService.saveLog();        // REQUIRES_NEW → 별도 트랜잭션 B
}
// A 롤백돼도 B는 이미 커밋 → 실패 로그 보존
```

<br>

**내부 호출 함정**

`@Transactional`은 AOP 프록시로 동작한다. 같은 클래스 내에서 내부 호출하면 프록시를 거치지 않아 `@Transactional`이 무시된다.

```java
public void order() {
    this.createOrder();  // 내부 호출 → 프록시 안 거침 → @Transactional 무시
}

@Transactional
public void createOrder() { ... }
```

해결: 별도 클래스로 분리.

<br>

---

# 🌊 cascade / orphanRemoval {#cascade}

**cascade** = 부모 엔티티 작업이 자식에게 전파.

```java
@OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
List<Order> orders;

em.persist(user);  // user 저장 + orders도 자동 저장
em.remove(user);   // user 삭제 + orders도 자동 삭제
```

**orphanRemoval = true** = 부모와 관계가 끊긴 자식을 자동 삭제.

```java
user.getOrders().remove(order);  // 리스트에서 제거만 해도 → DB DELETE
```

**차이:**

| | cascade REMOVE | orphanRemoval |
|---|---|---|
| 발생 시점 | 부모 삭제 시 | 부모와 관계 끊길 때 |
| 트리거 | `em.remove(parent)` | `list.remove(child)` |

보통 `cascade = ALL + orphanRemoval = true` 같이 쓴다. 단, 자식 엔티티가 여러 부모와 연관되어 있으면 cascade ALL 쓰지 말 것 — 의도치 않은 삭제가 발생한다.

<br>

---

# 💡 한눈에 정리 {#summary}

| 주제 | 핵심 |
|---|---|
| 영속성 컨텍스트 | 트랜잭션 단위 엔티티 저장소, 1차 캐시 = Map(id, entity) |
| 엔티티 상태 | 비영속→영속→준영속→삭제, 준영속은 dirty checking 안 됨 |
| dirty checking | 스냅샷 비교로 자동 UPDATE, @Transactional 필수 |
| flush | em.flush() / 트랜잭션 커밋 / JPQL 실행 직전 |
| N+1 | LAZY + 루프 접근 시 발생, EAGER로 해결 안 됨 |
| N+1 해결 | fetch join / @EntityGraph / BatchSize |
| @Transactional readOnly | 스냅샷 생략 → dirty checking 생략 → 성능 향상 |
| 전파 REQUIRED_NEW | 별도 트랜잭션 → 부모 롤백 무관 |
| 내부 호출 함정 | 프록시 안 거침 → @Transactional 무시 → 별도 클래스로 분리 |
| cascade ALL | 생명주기 같은 부모-자식 관계에만 사용 |
| orphanRemoval | 관계 끊기면 자동 DELETE |

<br>

---

# 📚 참고 자료 {#references}

**JPA 공식 / 표준**
- [Jakarta Persistence 3.1 Spec](https://jakarta.ee/specifications/persistence/3.1/) — JPA 표준 명세
- [Hibernate ORM 공식 문서](https://docs.jboss.org/hibernate/orm/6.0/userguide/html_single/Hibernate_User_Guide.html)

**N+1 / 성능**
- [Hibernate: Fetching Strategies](https://docs.jboss.org/hibernate/orm/6.0/userguide/html_single/Hibernate_User_Guide.html#fetching)
- [Spring Data JPA: @EntityGraph](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#jpa.entity-graph)

**@Transactional**
- [Spring Framework: Transaction Management](https://docs.spring.io/spring-framework/docs/current/reference/html/data-access.html#transaction)
- 김영한, *자바 ORM 표준 JPA 프로그래밍* (2015) — 국내 JPA 바이블
