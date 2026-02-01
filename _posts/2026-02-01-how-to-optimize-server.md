---
layout: post
title: "성능 최적화 가이드: TPS와 응답 시간 개선하기"
date: 2026-02-01
category: 개발
#image: assets/img/blog/default.png
author: 이소현
lang: ko
permalink: /ko/blog/performance-optimization-guide/
---

<br>

# 📊 성능 측정 지표

시스템 성능은 일반적으로 두 가지 지표로 평가됨!

## 응답 시간 (Response Time)
클라이언트가 요청을 보낸 시점부터 처리 결과를 받을 때까지 걸리는 시간

## 처리량 (Throughput)
TPS(Transactions Per Second): 초당 처리할 수 있는 트랜잭션 개수
- 수치가 높을수록 더 많은 요청을 처리할 수 있음
  <br> ex) TPS 30 : 1초당 30개의 트랜잭션 처리 가능!

<br>

---

# 🚀 TPS를 높이는 일반적인 방법과 한계

## 흔히 시도하는 방법
1. 서버 대수 늘리기 (스케일 아웃)
2. 쓰레드 풀 + DB 커넥션 풀 크기 늘리기

## 이 방법들의 한계
→ DB CPU 점유율이 70~80%를 넘어가면
- DB 쿼리 처리 시간이 증가
- 전체 처리 시간이 길어짐
- **오히려 TPS가 떨어지는 역효과 발생**

**⇒ 근본적으로 '처리 시간' 자체를 줄여야 함**

<br>

---

# ⚡ 처리 시간을 줄이는 방법

## 1. DB 최적화

### 1-1. 쿼리 튜닝

#### 인덱스 최적화
- 자주 조회하는 컬럼에 적절한 인덱스 적용
   - B-tree: 범위 검색, 정렬이 필요한 경우
   - Hash: 동등 비교(=)만 하는 경우
   - Composite Index: 여러 컬럼을 함께 조회하는 경우

#### WHERE, JOIN, ORDER BY, GROUP BY 절 최적화
- 이들 절에 사용되는 컬럼에 인덱스 고려
- **주의**: DB 옵티마이저는 조회 비율이 높으면 인덱스를 무시하고 Full Scan을 선택할 수 있음
   - DB마다 임계값이 다름 (일반적으로 전체 데이터의 5~15%)

  => [결론] 인덱스를 걸어서 조회할 때 전체 row 수의 1~5%만 조회할 수록 인덱스가 효과적인 것!   

#### 불필요한 SELECT * 자제
- 필요한 컬럼만 명시적으로 선택
- 네트워크 전송량 감소 및 DB 메모리 효율성 향상

#### JOIN 최적화

**1. JOIN 순서 최적화**
```sql
-- ❌ 잘못된 예: 큰 테이블을 먼저 조회
SELECT * 
  FROM orders o  -- 1,000만 건
  JOIN countries c ON o.country_id = c.id  -- 200건

-- ✅ 올바른 예: 작은 테이블을 먼저 조회
SELECT * 
  FROM countries c  -- 200건
  JOIN orders o ON c.id = o.country_id  -- 1,000만 건
```

**주의사항**:
- PostgreSQL 등 현대 DB는 자동으로 JOIN 순서를 최적화하지만 완벽하지 않음
- 통계 정보가 오래되었거나, 함수/서브쿼리/CTE 사용 시 최적화가 제대로 작동하지 않을 수 있음

**2. 존재 여부 확인**
```sql
-- ✅ EXISTS 사용: 첫 번째 매칭만 찾으면 즉시 종료
SELECT * 
  FROM users 
 WHERE EXISTS (
  SELECT 1 
    FROM orders 
   WHERE orders.user_id = users.id
);

-- ❌ IN 사용: 전체 서브쿼리 결과를 메모리에 로드
SELECT * 
  FROM users 
 WHERE id IN (
  SELECT user_id 
    FROM orders
);
```

**⇒ 결론: JOIN은 최소화하고, 존재 확인은 EXISTS 사용, IN은 가능하면 피하기**

#### EXPLAIN/PROFILE로 실행 계획 분석
- 쿼리가 어떻게 실행되는지 확인
- Full Table Scan 여부 체크
- 인덱스 사용 여부 확인

#### Batch 처리
1. INSERT, UPDATE, DELETE 다수 건은 **반드시** Bulk 처리
```sql
-- ❌ 개별 처리
INSERT INTO users VALUES (1, 'A');
INSERT INTO users VALUES (2, 'B');

-- ✅ Bulk 처리
INSERT INTO users VALUES (1, 'A'), (2, 'B'), (3, 'C');
```

2. 트랜잭션 묶기로 I/O 횟수 감소

**⇒ DB 최적화의 핵심: I/O 최소화 + CPU 부담 줄이기**

<br>

### 📌 I/O Bound vs CPU Bound 작업

#### I/O Bound 작업이란?
1. CPU는 거의 사용하지 않음
2. 외부 자원을 기다리는 시간이 대부분
3. 예시:
   - 네트워크 통신
   - 디스크 읽기/쓰기
   - DB 쿼리
   - 파일 I/O
   - 외부 API 응답 대기

**문제점**: I/O 대기 중 쓰레드는 아무 일도 못하고 블록됨 → 쓰레드 자원 낭비

<br>

### 1-2. 캐싱

메모리에 데이터를 저장해 DB 쿼리 실행 횟수를 줄임
- Redis, Memcached 등 인메모리 캐시 활용
- Application Level 캐시 (Caffeine, Guava Cache 등)

### 1-3. DB 인프라 개선

**읽기/쓰기 분리 (Read/Write Splitting)**
- Master: 쓰기 작업
- Slave(Replica): 읽기 작업
- 트래픽 분산으로 부하 감소

**스케일 업**
- CPU, 메모리, SSD 등 하드웨어 사양 향상
- 비용 대비 효과 고려 필요

### 1-4. Connection Pool 최적화

DB, HTTP Client, Redis 등의 커넥션 풀 설정 최적화
- `maximumPoolSize`: 최대 연결 수
- `minimumIdle`: 최소 유휴 연결 수
- `connectionTimeout`: 연결 대기 시간

**효과**:
- 과도한 커넥션 생성/폐기 방지
- CPU 및 메모리 절약
- 안정적인 성능 유지

<br>

## 2. 외부 API 호출 최적화

### 2-1. 캐싱

자주 변경되지 않는 외부 API 응답은 캐시에 저장

### 2-2. 동기 호출 제거

직접 호출 대신 메시지 큐를 통한 비동기 처리
- Kafka, RabbitMQ, AWS SQS 등 활용
- 외부 시스템 장애가 전파되지 않음

### 2-3. 비동기 처리

**Java 예시**:
```java
CompletableFuture.supplyAsync(() -> {
    return externalApiService.call();
});
```

**중요**:
- **비동기 처리는 성능 향상이 아닌, 요청 쓰레드 보호와 격리가 목적**
- 전체 처리 시간은 오히려 증가할 수 있음
- 사용자 경험 개선 및 시스템 안정성 향상이 주 목적

<br>

## 3. 데이터 집계 및 계산 최적화

### 실시간 계산의 문제점

좋아요 수, 조회 수, 팔로워 수 등을 매번 계산하면:
- 복잡한 JOIN 또는 COUNT 쿼리 실행
- DB 부하 증가
- **TPS 급격히 감소**

### 해결 방법

#### Pre-Aggregation (사전 집계)
```sql
-- ❌ 매번 계산
SELECT COUNT(*) 
  FROM likes 
 WHERE post_id = 123;

-- ✅ 미리 계산해서 저장
UPDATE posts 
   SET like_count = like_count + 1 
 WHERE id = 123;
```

#### Batch 작업으로 주기적 집계
- 실시간성이 중요하지 않은 데이터는 배치로 처리
- 예: 1시간마다 통계 재계산

#### Eventually Consistent 전략
- 약간의 데이터 불일치를 허용
- 궁극적으로는 일관성 보장
- 예: 좋아요 수가 1~2초 지연되어도 문제없는 경우

<br>

---

# ⏱️ 대기 시간을 줄이는 방법

**응답 시간 = 대기 시간 + 처리 시간**

대기 시간은 주로 네트워크 전송과 관련됨

## 대역폭 (Bandwidth)
최대로 전송할 수 있는 데이터 양
- 대역폭이 작으면 동시 접속자 증가 시 전송 속도 급격히 저하

### 응답 크기 줄이기

**압축 (Compression)**
```
Content-Encoding: gzip
```
- HTTP 응답 본문 압축
- 일반적으로 70~90% 크기 감소

**이미지 최적화**
- WebP 포맷 사용
- 적절한 해상도 및 품질 설정
- Lazy Loading 적용

**JSON 응답 최적화**
- 불필요한 필드 제거
- 데이터 구조 간소화

### 트래픽 분리

**CDN (Content Delivery Network) 활용**
- 정적 파일(이미지, CSS, JS)은 CDN에서 제공
- 원본 서버 부하 감소
- 사용자와 가까운 엣지 서버에서 제공 → 지연 시간 감소

**예시**:
```html
<!-- ❌ 원본 서버에서 직접 제공 -->
<img src="/static/images/logo.png">

<!-- ✅ CDN을 통해 제공 -->
<img src="https://cdn.example.com/images/logo.png">
```

### 대역폭 늘리기
인스턴스 스펙 업그레이드
- AWS EC2의 경우 인스턴스 타입에 따라 네트워크 대역폭 다름
- 예: t3.medium (최대 5 Gbps) → c5n.large (최대 25 Gbps)
- **단점**: 비용 증가

<br>

---

# ✅ 결론

성능 최적화는 단순히 서버를 늘리는 것이 아니라, 다층적 접근이 필요함

## 핵심 전략
1. **DB 최적화**: 쿼리 튜닝, 인덱스 최적화, I/O 최소화
2. **캐싱**: 불필요한 연산 및 DB 조회 제거
3. **비동기 처리**: 쓰레드 효율성 확보 및 시스템 격리
4. **사전 집계**: 실시간 계산 대신 미리 계산된 결과 활용
5. **네트워크 최적화**: 압축, CDN, 대역폭 관리

## 주의사항
- 무조건적인 스케일 아웃보다 **근본 원인 해결이 우선**
- 비동기는 만능이 아님 - **목적에 맞게 사용**
- 캐시는 **정합성 문제**를 고려해야 함
- 최적화는 **측정 기반**으로 진행 (추측 금지)