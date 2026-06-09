---
layout: works-single
title: 토스페이먼츠 결제 연동 데모
lang: ko
permalink: /ko/works/payment-by-tosspayments
category: 완료된 프로젝트
category_slug: completed-projects
image: assets/img/works/payment-by-tosspayments/toss-thumb.png
short_description: 토스페이먼츠 API 연동 결제 시스템 — 주문부터 결제 승인/취소까지

full_image: assets/img/works/payment-by-tosspayments/toss-thumb.png
info:
  - label: 기간
    value: 2026.06
  - label: Language / Framework
    value: Kotlin, Spring Boot 3.3, Spring Data JPA
  - label: Security / Auth
    value: Spring Security + JWT (Access + Refresh Token)
  - label: DB / 배포
    value: PostgreSQL (Neon), Railway

description1:
  show: yes
  title: 프로젝트 소개
  text1: >
    토스페이먼츠 API를 연동한 결제 시스템 데모. 회원가입/로그인부터 주문 생성, 결제 위젯 연동, 승인/취소, 내역 조회까지 실제 결제 플로우를 경험할 수 있다.
    <br/><br/>
    <a href="https://payment-by-tosspayments-production-6d2b.up.railway.app" target="_blank">🌐 서비스 바로가기</a>

description2:
  show: yes
  title: 주요 기능
  text1: >
    회원가입 / 로그인 (JWT Access + Refresh Token) <br/>
    주문 생성 <br/>
    토스페이먼츠 결제 위젯 연동 <br/>
    결제 승인 / 취소 <br/>
    결제 내역 조회 <br/>
    미완료 결제 자동 만료 처리 (스케줄러)

description3:
  title: 기술 선택 이유
  text2: >
    <strong>Kotlin + Spring Boot</strong> — 결제 도메인은 null 처리 실수가 곧 장애. Kotlin의 null safety로 컴파일 타임에 강제하고, 도메인 객체를 간결하게 표현할 수 있어 선택.<br/><br/>
    <strong>토스페이먼츠</strong> — 국내 최고 수준의 개발자 문서와 테스트 모드 완비. 실제 결제 플로우(요청 → 승인 → 환불)와 에러 처리를 학습하기 위해 선택.<br/><br/>
    <strong>JWT (Access + Refresh Token)</strong> — 현재 실무 트렌드이자 면접 빈출 주제. Stateless로 수평 확장 용이.<br/><br/>
    <strong>PostgreSQL (Neon)</strong> — 결제 데이터는 트랜잭션/정합성 필수 → RDB. Neon은 무료이면서 데이터 영구 보존 (Railway 내장 DB는 90일 후 삭제).<br/><br/>
    <strong>Thymeleaf</strong> — 토스 SDK가 프론트에서 호출되므로 UI 필요. React는 오버킬, Spring 내장으로 별도 배포 불필요.<br/><br/>
    <strong>Modular Monolith + DDD</strong> — 단일 배포로 운영 단순화. 도메인별 bounded context 분리로 나중에 MSA 전환 시 서비스로 그대로 분리 가능.
---
