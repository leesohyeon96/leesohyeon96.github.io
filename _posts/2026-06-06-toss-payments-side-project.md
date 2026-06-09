---
layout: post
title: "토스페이먼츠 연동 결제 사이드 프로젝트 — 설계부터 구현까지"
date: 2026-06-06
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/toss-payments-side-project/
---

<br>

결제 시스템을 직접 설계하고 구현해본 경험을 정리한 글이다. 토스페이먼츠 SDK를 활용해 주문-결제-환불 플로우를 구축하면서 고민한 내용들을 담았다.

<br>

---

## 목차

- [기술 스택](#tech-stack)
- [아키텍처: Modular Monolith + DDD](#architecture)
- [데이터 모델](#data-model)
- [결제 플로우](#payment-flow)
- [핵심 구현 포인트](#key-points)
- [확장 고려사항](#extensions)

---

# 🛠️ 기술 스택 {#tech-stack}

| 분류 | 선택 |
|---|---|
| 언어/프레임워크 | Kotlin + Spring Boot |
| ORM | JPA |
| DB | PostgreSQL (Neon 무료) |
| 프론트 | Thymeleaf |
| 인증 | JWT (Access + Refresh Token) |
| 결제 | 토스페이먼츠 |
| 배포 | Render (무료) |

<br>

---

# 🏗️ 아키텍처: Modular Monolith + DDD {#architecture}

마이크로서비스는 운영 부담이 크고, 단순 레이어드 아키텍처는 도메인 로직이 서비스 레이어에 몰려 비대해지는 문제가 있다. 그 중간 지점으로 **Modular Monolith + DDD**를 선택했다.

```
src/
├── auth/
│   ├── domain/          ← 엔티티, 도메인 규칙
│   ├── application/     ← 유스케이스, 서비스
│   ├── infrastructure/  ← JPA 레포지토리, 외부 API
│   └── presentation/    ← 컨트롤러, DTO
├── order/
│   └── (동일 구조)
├── payment/
│   └── (동일 구조)
└── common/
    ├── exception/       ← 공통 예외
    └── ApiResponse      ← 공통 응답 포맷
```

모듈 간 직접 의존 없이 application 레이어를 통해 소통한다. 나중에 분리가 필요하면 모듈 단위로 뽑아낼 수 있도록 경계를 명확히 설정했다.

<br>

---

# 📊 데이터 모델 {#data-model}

**User**

```
id (PK)
email (unique)
password (bcrypt)
```

**Order**

```
id (UUID, PK)
userId (FK)
totalAmount
status: PENDING → PAID → CANCELLED
```

**Payment**

```
id (PK)
orderId (FK, unique)
paymentKey      ← 토스페이먼츠 발급 키
method          ← 카드, 계좌이체 등
amount
cancelledAmount ← 부분환불 추적
status: READY → DONE → CANCELLED → FAILED
```

Order와 Payment는 1:N 관계다. 하나의 주문에 결제 시도가 여러 번 발생할 수 있다 (재시도, 분할결제 등).

<br>

---

# 💳 결제 플로우 {#payment-flow}

```
1. 주문 생성 (Order: PENDING)
        ↓
2. Payment READY 선저장
        ↓
3. 프론트 — 토스 SDK 호출 (카드 입력, 인증)
        ↓
4. 백엔드 — 토스 승인 API 호출
        ↓
   ┌────────────────────────────────┐
   │ 성공      → Payment: DONE      │
   │ 일시장애  → 재시도 3회          │
   │           (exponential backoff) │
   │ 복구불가  → 토스 취소 + FAILED  │
   └────────────────────────────────┘
        ↓
5. Webhook (안전망)
   토스 서버에서 결제 결과를 다시 한번 전송
   → 클라이언트 응답 유실 케이스 보완
```

**Exponential Backoff 재시도:**

```kotlin
val delays = listOf(1_000L, 2_000L, 4_000L)  // 1초, 2초, 4초

for ((attempt, delay) in delays.withIndex()) {
    try {
        val result = tossClient.confirm(paymentKey, orderId, amount)
        payment.confirm(result.paymentKey, result.method)
        return result
    } catch (e: TossTemporaryException) {
        if (attempt == delays.lastIndex) throw e
        Thread.sleep(delay)
    }
}
```

<br>

---

# 🔑 핵심 구현 포인트 {#key-points}

## 멱등성 — 같은 요청이 두 번 오면?

`orderId`를 unique 제약으로 관리하고, 결제 승인 전에 상태를 먼저 확인한다.

```kotlin
fun confirmPayment(orderId: UUID, paymentKey: String, amount: Long) {
    val payment = paymentRepository.findByOrderId(orderId)
        ?: throw PaymentNotFoundException()

    if (payment.status == PaymentStatus.DONE) {
        return  // 이미 처리됨 — 중복 요청 무시
    }

    // 토스 승인 API 호출
    tossClient.confirm(paymentKey, orderId, amount)
    payment.confirm(paymentKey, method)
}
```

DB unique 제약이 마지막 안전망 역할을 한다. 동시에 두 요청이 들어와도 하나만 통과한다.

<br>

## 상태 전이 — 도메인 메서드에서 검증

상태 변경 로직을 서비스가 아닌 도메인 엔티티에 둔다. 잘못된 상태 전이는 도메인 레벨에서 막는다.

```kotlin
@Entity
class Payment(
    val orderId: UUID,
    val amount: Long,
    var status: PaymentStatus = PaymentStatus.READY,
    var paymentKey: String? = null,
    var cancelledAmount: Long = 0,
) {
    fun confirm(paymentKey: String, method: String) {
        check(status == PaymentStatus.READY) {
            "READY 상태에서만 승인 가능합니다. 현재: $status"
        }
        this.paymentKey = paymentKey
        this.status = PaymentStatus.DONE
    }

    fun cancel(cancelAmount: Long) {
        check(status == PaymentStatus.DONE) {
            "DONE 상태에서만 취소 가능합니다. 현재: $status"
        }
        check(cancelAmount <= amount - cancelledAmount) {
            "취소 가능 금액을 초과했습니다."
        }
        this.cancelledAmount += cancelAmount
        if (cancelledAmount == amount) {
            this.status = PaymentStatus.CANCELLED
        }
    }
}
```

<br>

## 부분환불 — cancelledAmount 추적

전액 취소는 `cancelledAmount == amount`일 때 CANCELLED로 전이. 부분 취소는 cancelledAmount를 누적하여 남은 취소 가능 금액을 계산한다.

```kotlin
// 10,000원 결제 → 3,000원 부분취소 → 7,000원 부분취소 → CANCELLED
payment.cancel(3_000)   // cancelledAmount = 3,000 / status = DONE
payment.cancel(7_000)   // cancelledAmount = 10,000 / status = CANCELLED
```

<br>

## JWT 인증 — Access + Refresh Token

```
Access Token:  만료 15분 (짧게 → 탈취 피해 최소화)
Refresh Token: 만료 7일  (서버에서 관리 → 강제 만료 가능)
```

Refresh Token은 DB에 저장해 로그아웃 시 무효화한다. Access Token 탈취 시 15분 후 자동 만료.

<br>

---

# 🔭 확장 고려사항 {#extensions}

**Outbox Pattern**

결제 완료 후 외부 시스템(이메일, 재고 차감 등)에 이벤트를 전달할 때, DB 트랜잭션과 이벤트 발행의 원자성을 보장하지 못하는 문제가 있다.

```
결제 성공 → DB 커밋 → 이벤트 발행 실패? → 이벤트 유실
```

Outbox Pattern은 이벤트를 DB에 먼저 저장(outbox 테이블)하고 별도 프로세스가 발행하는 방식으로 이 문제를 해결한다. 현재 프로젝트 규모에선 적용하지 않았고 확장 시 도입 예정.

**분산락**

재고 차감 같은 동시성 이슈가 생기면 Redis 분산락 도입 검토.

**Read Replica**

트래픽 증가 시 조회 쿼리를 Read Replica로 라우팅.
