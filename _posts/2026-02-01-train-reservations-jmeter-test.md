---
layout: post
title: "SRT/KTX 예매 시스템 구현 및 JMeter 부하 테스트"
date: 2026-02-01
category: 자유
#image: assets/img/blog/default.png
author: 이소현
lang: ko
permalink: /ko/blog/train-reservations-jmeter-test/
---

## 🎯 프로젝트 개요

[SRT/KTX 예매 시스템 설계](/ko/blog/how-to-reserve-srt-or-ktx/)에서 설명한 설계를 실제로 구현하고 JMeter를 사용한 부하 테스트를 진행했습니다.

---

## 📦 GitHub 레포지토리

<a href="https://github.com/leesohyeon96/train-reservations-jmeter-test" target="_blank">🔗 train-reservations-jmeter-test</a>

---

## 🚀 구현 단계별 개선 사항

### Step1: 기본 구현
- **기술 스택**: JPA + 비관적 락
- **목적**: 기본적인 동시성 제어 테스트
- **문제점**: 높은 트래픽에서 성능 저하 및 데드락 발생

### Step2: Redis Queue 도입
- **기술 스택**: JPA + Redis Queue + Lua 스크립트
- **개선 사항**: 
  - 동시성 충돌 문제 해결
  - 예약 순서 보장
- **핵심**: Lua 스크립트로 원자적 처리 보장

### Step3: 성능 최적화
- **기술 스택**: JPA + Redis Cluster + 배치 처리 강화
- **개선 사항**:
  - Redis Connection Pool 최적화 (최대 20개 연결)
  - 배치 크기: 100 → **500**으로 증가
  - 처리 주기: 500ms → **200ms**로 단축
  - Worker 스레드: 4개 → **8개**로 증가
  - 좌석 정보 캐싱 (TTL: 30분)
  - 예약 내역 캐싱 (TTL: 5분)

### Step4-1: RabbitMQ 도입
- **기술 스택**: JPA + Redis (재고 관리) + RabbitMQ
- **특징**:
  - Direct Exchange 사용
  - Dead Letter Queue (DLQ) 활용
  - 메시지 지속성 보장
  - Management UI 제공

### Step4-2: Kafka 도입
- **기술 스택**: JPA + Redis (재고 관리) + Kafka
- **특징**:
  - 3개 파티션으로 병렬 처리
  - Consumer Group 기반 확장
  - 파티션 내 순서 보장
  - 높은 처리량

---

## 📊 Step4-1 vs Step4-2 비교

| 항목 | RabbitMQ | Kafka |
|------|----------|-------|
| 구조 | Exchange → Queue | Topic → Partition |
| 순서 보장 | Queue 내 순서 보장 | 파티션 내 순서 보장 |
| 처리량 | 중간 | 매우 높음 |
| 확장성 | Consumer 수 증가 | 파티션 수 증가 |
| 특징 | Dead Letter Queue | 오프셋 관리 |

---

## 🧪 테스트 방법

1. Docker Compose로 인프라 실행 (Redis/RabbitMQ/Kafka)
2. 애플리케이션 실행
3. JMeter 테스트 플랜 실행
4. 성능 메트릭 확인

---

## 📝 관련 글

- [SRT/KTX 예매 시스템 설계](/ko/blog/how-to-reserve-srt-or-ktx/) - 시스템 설계 및 아키텍처 설명
