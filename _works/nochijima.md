---
layout: works-single
title: 놓치지마 (Nochijima)
lang: ko
permalink: /ko/works/nochijima
category: 진행중인 프로젝트
category_slug: on-going-projects
image: assets/img/works/nochijima/nochijima-thumb.png
short_description: 정부 지원사업 공고를 매일 모아, 내 조건에 맞는 것만 메일로 보내주는 구독 서비스

full_image: assets/img/works/nochijima/nochijima-thumb.png
info:
  - label: 기간
    value: 2026.08 ~ 운영 중 (1인 개발)
  - label: Backend
    value: Kotlin, Spring Boot 3.3, Spring Data JPA, WebClient, Thymeleaf
  - label: Infra / DB
    value: Render, PostgreSQL (Supabase), UptimeRobot
  - label: External
    value: Brevo (메일), PortOne V2 + KG이니시스 (정기결제)
  - label: 규모
    value: Gradle 모듈 7개 · 코드 13.7k줄 · 테스트 10.3k줄 (@Test 678개)

description1:
  show: yes
  title: 프로젝트 소개
  text1: >
    기업마당·K-Startup에 매일 올라오는 정부 지원사업 공고를 자동으로 수집하고, 구독자가 등록한 <strong>지역·분야·기업 조건</strong>에 맞는 공고만 골라 아침 메일로 보내준다.
    <br/><br/>
    기획부터 설계·개발·배포·운영·결제 연동까지 1인으로 진행했다. 서버 1대, DB 1개로 인프라 비용 0원(도메인 제외)으로 운영한다.
    <br/><br/>
    <a href="https://nochijima.com" target="_blank">🌐 서비스 바로가기</a>
  text2: >
    <strong>공고 자동 수집</strong> — 공공 API 2곳에서 새 공고를 가져와 지역·기간·제목을 정규화하고, 두 곳에 같은 공고가 있으면 하나로 합친다.<br/><br/>
    <strong>조건 매칭 메일</strong> — 적합도 등급별로 나눠 보내고, 같은 공고는 두 번 보내지 않는다.<br/><br/>
    <strong>무료 / 유료 구독</strong> — 무료는 주 1회(요일 분산), 유료는 매일. 유료는 카드 등록 후 매월 자동 결제.<br/><br/>
    <strong>공개 공고 페이지 (SEO)</strong> — 공고 상세·지역/분야별 목록·sitemap으로 검색 유입.<br/><br/>
    <strong>자동 복구</strong> — 메일 재시도, 결제 대사, 매일 아침 이상 점검.

description2:
  show: yes
  title: 아키텍처
  description2_image:
    - assets/img/works/nochijima/system-context.png
    - assets/img/works/nochijima/module-dependency.png
    - assets/img/works/nochijima/ports-adapters.png
    - assets/img/works/nochijima/daily-timeline.png
  text1: >
    <strong>모듈러 모놀리스</strong> — 서버 하나, DB 하나, 배포 하나. 1인 운영에서 마이크로서비스는 배포·모니터링·장애 지점만 늘린다. 대신 Gradle 멀티모듈로 나눠 "일단 가져다 쓰자"를 컴파일러가 막게 했다.<br/><br/>
    <strong>모듈 경계</strong> — 각 모듈은 공유 타입 모듈만 알고(예외 없음), 여러 모듈을 엮는 일은 오케스트레이터 하나가 맡는다. 가입할 때 구독자 저장과 인증 메일 적재는 같은 트랜잭션이어야 하는데, 구독 모듈은 "메일을 보내야 한다"는 포트만 알고 실제 적재는 오케스트레이터가 같은 트랜잭션 안에서 한다. 트랜잭션 밖에서 불리면 실패하도록 막고 테스트로 묶었다.
  text2: >
    <strong>포트와 어댑터는 필요한 곳에만</strong> — 공고 수집·메일·결제처럼 외부 교체 가능성이 실재하는 곳에만 포트를 뒀다. 매칭은 순수 함수라 포트 없음.<br/><br/>
    호출부는 포트만 알기 때문에 <strong>업체를 바꿔도 어댑터와 설정만 바뀐다.</strong><br/><br/>
    <strong>배치 중심 서버</strong> — 07:00 수집 → 07:55 유료 발송 → 08:00 무료 발송 → 09:00 점검. 순서가 곧 의존성이라 시각 사이에 여유를 뒀다.

description3:
  title: 설계 결정
  githubgist_url: https://nochijima.com
  text1: 🌐 nochijima.com
  text2: >
    <strong>트랜잭션 밖에서 외부 호출</strong> — DB 커넥션이 5개뿐이라, 트랜잭션 안에서 메일·결제 API를 부르면 커넥션이 바닥난다. 저장 → 커밋 → 외부 호출 → 결과 저장으로 쪼개고, 쓰기 담당을 별도 빈으로 분리했다. (같은 클래스 안 호출은 @Transactional이 무시된다)<br/><br/>
    <strong>아웃박스 패턴</strong> — 메일을 업무 데이터와 같은 트랜잭션에 적재하고 별도 작업이 발송한다. 실패 시 30초 → 5분 → 30분 → 2시간 간격으로 재시도.<br/><br/>
    <strong>결제: 먼저 기록하고, 결과는 직접 확인</strong> — PG 호출 전에 주문을 PENDING으로 저장하고, 결과를 모르는 결제는 30분마다 PG에 조회해 맞춘다(대사). 웹훅은 신호로만 쓰고, 청구 금액은 브라우저가 아니라 서버 기록을 쓴다.<br/><br/>
    <strong>DB 유니크 제약으로 중복 방지</strong> — 분산 락 대신, 같은 공고 재발송·같은 주문 재청구를 DB 제약으로 막아 인스턴스가 늘어도 안전하게 했다.
---
