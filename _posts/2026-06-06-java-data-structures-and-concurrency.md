---
layout: post
title: "Java 자료구조와 동시성에 대해서"
date: 2026-06-06
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/java-data-structures-and-concurrency/
---

<br>

B+Tree, Red-Black Tree, HashMap 내부 구조부터 멀티스레드 동시성 제어까지 — 백엔드 면접에서 자주 등장하는 자료구조와 동시성 개념을 정리했다.

<br>

---

## 목차

- [B-Tree vs B+Tree](#b-tree)
- [Red-Black Tree](#rbt)
- [HashMap 내부 구조](#hashmap)
- [주요 컬렉션 비교](#collections)
- [Java 동시성](#concurrency)
- [한눈에 정리](#summary)
- [참고 자료](#references)

---

# 🌳 B-Tree vs B+Tree {#b-tree}

**MySQL InnoDB가 B-Tree가 아닌 B+Tree를 쓰는 이유는?**

둘 다 균형 트리지만 내부 노드 구조가 다르다.

```
B-Tree:   내부 노드 = [key | data | key | data | ...]
B+Tree:   내부 노드 = [key | key | key | ...]  ← data 없음
          리프 노드 = [key | data] → [key | data] → [key | data]
```

B+Tree의 내부 노드는 key만 저장하므로 같은 디스크 페이지(16KB)에 더 많은 key를 담을 수 있다. 노드당 key가 많아질수록 트리 높이가 낮아지고, 루트에서 리프까지 이동하는 디스크 I/O 횟수가 줄어든다.

리프 노드끼리 연결리스트로 연결되어 있어 `BETWEEN`, `>=`, `ORDER BY` 같은 범위 조회도 효율적이다. 트리를 다시 올라갈 필요 없이 리프를 순서대로 순회하면 된다.

**정리:**
- 내부 노드 fan-out 증가 → 트리 높이 감소 → point query I/O 감소
- 리프 연결리스트 → range query 재탐색 불필요

<br>

---

# 🔴 Red-Black Tree {#rbt}

**Red-Black Tree를 실제로 어디서 쓰고, AVL Tree 대신 쓰는 이유는?**

둘 다 균형 이진 탐색 트리지만 균형 조건이 다르다.

| | AVL | Red-Black Tree |
|---|---|---|
| 균형 조건 | 엄격 (높이차 ≤ 1) | 완화 (최장경로 ≤ 최단×2) |
| 검색 | 더 빠름 | 약간 느림 |
| 삽입/삭제 | rotation 더 많음 | rotation 적음 |
| 실무 선택 | 읽기 위주 | 쓰기 빈번 |

Map/Set 같은 범용 자료구조는 삽입/삭제가 빈번하므로 Red-Black Tree를 선택한다.

**실무 사용처:**
- Java `TreeMap`, `TreeSet`
- Java `HashMap` — Java 8+에서 버킷 내 항목 8개 초과 시 LinkedList → RBT 전환
- Linux CFS 스케줄러 (프로세스 우선순위 관리)
- C++ STL `std::map`, `std::set`

<br>

---

# 🗂️ HashMap 내부 구조 {#hashmap}

**HashMap에서 해시 충돌이 발생하면?**

충돌 처리 방식은 **Separate Chaining** — 같은 버킷에 LinkedList로 연결한다.

```
bucket[3] → [key=A, val=1] → [key=B, val=2] → null
```

Java 8을 기점으로 최악 케이스 성능이 달라진다.

| | Java 8 이전 | Java 8 이후 |
|---|---|---|
| 버킷 내 구조 | LinkedList | LinkedList → RBT (8개 초과 시) |
| 최악 시간복잡도 | O(n) | O(log n) |

```java
static final int TREEIFY_THRESHOLD = 8;   // LinkedList → RBT
static final int UNTREEIFY_THRESHOLD = 6; // RBT → LinkedList (thrashing 방지)
```

8개 미만일 땐 RBT 오버헤드(포인터, 색 정보, rotation)가 오히려 비싸므로 LinkedList가 유리하다. 8이라는 임계값은 좋은 해시 함수 기준 포아송 분포상 버킷당 8개 초과 확률이 약 0.00000006 수준이라는 통계적 근거가 있다.

**HashMap 시간복잡도:**

| 상태 | 복잡도 |
|---|---|
| 충돌 없음 | O(1) |
| 충돌 많음 (Java 8 이후, 8개 초과) | O(log n) |
| 충돌 많음 (Java 8 이전) | O(n) |

<br>

**equals()와 hashCode()를 같이 오버라이드해야 하는 이유는?**

HashMap은 키를 찾을 때 두 단계를 거친다.

```
1. hashCode() → 버킷 찾기
2. equals()   → 버킷 내에서 동일 키 확인
```

hashCode()만 오버라이드하고 equals()를 빠뜨리면:

```java
map.get(u2) 동작:
1. u2.hashCode() → 같은 버킷 찾음 ✅
2. u1.equals(u2) → Object 기본 = 주소 비교 → false ❌
3. 결과: null
```

반대로 equals()만 오버라이드하면:

```java
map.get(u2) 동작:
1. u2.hashCode() → 주소 기반 다른 값 → 다른 버킷 ❌
2. 버킷 자체를 못 찾음
3. 결과: null
```

**규칙: equals()가 true이면 hashCode()도 반드시 같아야 한다.**

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

# 📋 주요 컬렉션 비교 {#collections}

**PriorityQueue 내부 구조와 시간복잡도는?**

PriorityQueue는 **Min-Heap(완전 이진 트리)** 으로 구현된다. 항상 최솟값이 루트에 위치하며, 내부적으로는 배열로 저장한다.

```
      1
    /   \
   3     2
  / \   /
 7   4  5

배열: [1, 3, 2, 7, 4, 5]
부모 i → 왼쪽 자식 2i+1, 오른쪽 자식 2i+2
```

| 연산 | 복잡도 |
|---|---|
| offer() (삽입) | O(log n) |
| poll() (최솟값 꺼내기) | O(log n) |
| peek() (최솟값 조회) | O(1) |

삽입/삭제 시 heap 조건을 유지하기 위해 위아래로 비교(heapify)하므로 O(log n).

<br>

**ArrayList vs LinkedList 차이는?**

| 연산 | ArrayList | LinkedList |
|---|---|---|
| 조회 (index) | O(1) | O(n) |
| 삽입/삭제 (중간) | O(n) | O(1) |
| 삽입/삭제 (끝) | O(1) amortized | O(1) |

ArrayList는 배열 기반이라 인덱스로 바로 접근하므로 O(1). 중간 삽입/삭제 시 뒤 원소를 모두 이동해야 해서 O(n).

LinkedList는 삽입/삭제 자체는 O(1)이지만, 해당 노드까지 찾아가는 과정이 O(n)이라 결국 탐색이 병목이다. 실무에서 LinkedList를 쓸 일은 거의 없고 대부분 ArrayList를 사용한다.

<br>

**Java에서 Stack 대신 Deque를 쓰는 이유는?**

`Stack` 클래스는 `Vector`를 상속하며 모든 메서드에 `synchronized`가 붙어있다. 단일 스레드에서도 불필요한 동기화 오버헤드가 발생한다.

- 단일 스레드 → `ArrayDeque`
- 멀티 스레드 → `ConcurrentLinkedDeque` 또는 `LinkedBlockingDeque`

`Stack`은 어느 상황에서도 쓸 이유가 없다.

<br>

---

# 🔒 Java 동시성 {#concurrency}

**멀티스레드 환경에서 HashMap을 그냥 쓰면?**

Race Condition이 발생한다.

```
초기값: count = 0

스레드 A: get("count") → 0 읽음
스레드 B: get("count") → 0 읽음  ← A가 아직 안 씀

스레드 A: 0 + 1 = 1 → put
스레드 B: 0 + 1 = 1 → put

결과: count = 1  (2가 되어야 하는데 — 데이터 유실)
```

또한 동시 rehashing 시 데이터 손상이 발생할 수 있다.

**해결책:**

```java
// 1. ConcurrentHashMap — 버킷 단위 락, 성능 좋음
Map<String, Integer> map = new ConcurrentHashMap<>();

// 2. synchronized 블록 — 전체 map 잠금, 성능 나쁨
synchronized(map) { map.put(...); }

// 3. Collections.synchronizedMap — synchronized 블록과 유사
Map<String, Integer> map = Collections.synchronizedMap(new HashMap<>());
```

**ConcurrentHashMap이 Hashtable보다 성능이 좋은 이유:**

- Hashtable: 모든 메서드에 `synchronized` → 전체 map 잠금, 한 번에 스레드 1개만 접근
- ConcurrentHashMap: 버킷 단위 락 → 다른 버킷은 동시 접근 가능, 처리량 높음

<br>

**volatile 키워드가 하는 일은?**

각 스레드는 CPU 코어에 할당되어 실행되며, 성능을 위해 변수를 코어 캐시에 복사해서 사용한다. 캐시는 코어마다 따로 존재하므로 한 스레드가 변수를 변경해도 다른 스레드의 캐시에는 반영되지 않을 수 있다 (Visibility Problem).

`volatile`을 붙이면 해당 변수를 항상 메인 메모리에서 직접 읽고 쓴다. 모든 스레드가 같은 곳을 보므로 항상 최신값이 보장된다.

단, `volatile`은 **가시성만 보장**하며 Race Condition은 막지 못한다.

```java
volatile int count = 0;
count++;  // 여전히 Race Condition — read/modify/write가 원자적이지 않음
```

카운터에는 `AtomicInteger`를 써야 한다.

<br>

**AtomicInteger는 어떻게 Race Condition을 막나?**

**CAS (Compare-And-Swap)** — lock 없이 원자적 연산을 수행한다.

```java
// 내부 동작 (의사코드)
do {
    expected = count.get();      // 현재값 읽기
    newVal = expected + 1;
} while (!compareAndSwap(expected, newVal));  // 성공할 때까지 재시도
```

메모리의 값이 예상값과 같을 때만 변경하고, 그 사이 다른 스레드가 바꿨으면 재시도한다. CPU 명령어 1개로 실행되므로 원자적이다.

| | synchronized | AtomicInteger |
|---|---|---|
| 방식 | lock + 대기 (블로킹) | CAS 재시도 (논블로킹) |
| 경쟁 적을 때 | 느림 | 빠름 |
| 경쟁 심할 때 | 대기 스레드 CPU 안 씀 | 재시도 반복으로 CPU 낭비 |

쓰기가 폭발적으로 많은 경우엔 `LongAdder`가 더 나을 수 있다. 스레드마다 별도 셀에 더한 뒤 나중에 합산하는 방식으로 CAS 충돌을 최소화한다.

<br>

**deadlock이 뭐고, 방지법은?**

두 스레드가 서로의 자원을 기다리며 영원히 대기하는 상태다.

```
스레드A: 락1 보유 → 락2 대기
스레드B: 락2 보유 → 락1 대기
→ 영원히 진행 불가
```

**방지법:**

```java
// 1. 락 획득 순서 고정
// 모든 스레드가 항상 락A → 락B 순서로 획득 → 순환 대기 자체 방지

// 2. tryLock + timeout
if (lock.tryLock(1, TimeUnit.SECONDS)) {
    // 성공
} else {
    // 포기 → deadlock 탈출
}
```

3. 락 범위 최소화 — 동시에 2개 이상 잡는 설계 자체를 피한다.

DB deadlock은 DB가 자체 감지 후 한 트랜잭션을 강제 롤백한다.

<br>

**ThreadLocal이 뭐고, 어디서 쓰이나?**

스레드마다 독립적인 변수 저장소를 제공한다. 같은 변수라도 스레드별로 다른 값을 가질 수 있다.

```java
ThreadLocal<String> userId = new ThreadLocal<>();

// 스레드A
userId.set("user123");

// 스레드B
userId.set("user456");

// 스레드A에서 읽으면
userId.get();  // "user123" — 스레드B 값 안 섞임
```

**Spring에서 쓰이는 곳:**

- `SecurityContextHolder` — 요청마다 로그인 유저 정보 저장 (스레드별 독립)
- `@Transactional` — DB 커넥션을 ThreadLocal에 저장해 같은 스레드 내 공유
- MDC — 로그에 traceId, userId 자동 포함

**주의:** 스레드 풀은 스레드를 재사용하므로 요청 처리 후 반드시 remove() 해야 한다. 안 지우면 이전 요청의 데이터가 다음 요청에 노출된다.

```java
try {
    userId.set("user123");
    // ...
} finally {
    userId.remove();
}
```

**MDC (Mapped Diagnostic Context):**

MDC도 내부적으로 ThreadLocal을 사용한다. logback 패턴에 `%X{traceId}` 를 설정해두면 MDC에 넣은 값이 모든 로그에 자동으로 붙는다.

```java
// Filter에서 세팅 (Spring 진입 전 가장 앞단)
MDC.put("traceId", UUID.randomUUID().toString());

// 어디서든 로그 찍으면 자동 포함
log.info("주문 처리 시작");
// 출력: [traceId=abc-123] 주문 처리 시작
```

Filter에서 세팅하는 이유는 DispatcherServlet 이전 구간 로그에도 traceId를 남기기 위함이다. Interceptor에서 하면 Filter → DispatcherServlet 구간 로그에는 traceId가 없다.

MSA에서는 서비스 간 호출 시 traceId를 HTTP 헤더에 담아 전달하고, 각 서비스에서 MDC에 설정한다. Kibana 등에서 traceId로 검색하면 전체 요청 흐름을 한번에 추적할 수 있다.

<br>

---

# 💡 한눈에 정리 {#summary}

| 주제 | 핵심 |
|---|---|
| B+Tree vs B-Tree | 내부 노드 key만 → fan-out 증가 → 높이 감소, 리프 연결 → range scan |
| Red-Black Tree | 삽입/삭제 성능 위해 균형 완화, TreeMap/HashMap 버킷에서 사용 |
| HashMap 충돌 | Separate Chaining, Java 8+ 버킷 8개 초과 시 RBT 전환 O(n)→O(log n) |
| equals+hashCode | 둘 다 오버라이드 필수, 규칙: equals true → hashCode 같아야 함 |
| PriorityQueue | Min-Heap, 삽입/삭제 O(log n) |
| ArrayList vs LinkedList | 조회 O(1) vs O(n), 실무는 대부분 ArrayList |
| Deque | Stack 대신 사용, 단일스레드 ArrayDeque |
| ConcurrentHashMap | 버킷 단위 락, Hashtable 전체 락보다 성능 우수 |
| volatile | 가시성 보장 (메인 메모리 직접 읽기), Race Condition은 못 막음 |
| AtomicInteger | CAS로 논블로킹 원자적 연산, 경쟁 적을 때 synchronized보다 빠름 |
| ThreadLocal | 스레드별 독립 저장소, 반드시 remove() 필요 |
| MDC | ThreadLocal 기반, 로그에 traceId 자동 포함 |

<br>

---

# 📚 참고 자료 {#references}

**B+Tree / B-Tree**
- [MySQL 8.0 InnoDB On-Disk Structures](https://dev.mysql.com/doc/refman/8.0/en/innodb-physical-structure.html) — MySQL 공식 문서
- Alex Petrov, *Database Internals* (2019), Chapter 3 — B-Tree Variants

**HashMap Java 8 개선**
- [JEP 180: Handle Frequent HashMap Collisions with Balanced Trees](https://openjdk.org/jeps/180) — OpenJDK 공식 제안서
- [OpenJDK HashMap.java 소스코드](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java) — TREEIFY_THRESHOLD 주석 포함

**Red-Black Tree**
- Thomas H. Cormen et al., *Introduction to Algorithms* (CLRS), Chapter 13
- [OpenJDK TreeMap.java 소스코드](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/TreeMap.java)

**Java 동시성 (volatile, AtomicInteger, ConcurrentHashMap)**
- Brian Goetz et al., *Java Concurrency in Practice* (2006) — 동시성 바이블
- [JSR-133: Java Memory Model](https://www.cs.umd.edu/~pugh/java/memoryModel/jsr133.pdf) — volatile 명세
- [Java 8 ConcurrentHashMap 소스코드](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ConcurrentHashMap.java)

**ThreadLocal / MDC**
- [Java ThreadLocal 공식 문서](https://docs.oracle.com/en/java/docs/api/java.base/java/lang/ThreadLocal.html)
- [Logback MDC 공식 문서](https://logback.qos.ch/manual/mdc.html)
