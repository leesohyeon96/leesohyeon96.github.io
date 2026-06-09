---
layout: works-single
title: Currency Calculator (환율 계산기)
lang: ko
permalink: /ko/works/currency-calculator-web
category: 완료된 프로젝트
category_slug: completed-projects
image: assets/img/works/currency-calculator-web/currency-calculator-thumb.png
short_description: 여행자를 위한 실시간 환율 계산기 + AI 여행 조언

full_image: assets/img/works/currency-calculator-web/currency-calculator-thumb.png
info:
  - label: 기간
    value: 2026.05 ~ 2026.06
  - label: Frontend
    value: React 19, Vite, Tailwind CSS, i18next, framer-motion
  - label: Backend
    value: Spring Boot 3.2.5, Kotlin, WebFlux + Coroutines, Spring AI
  - label: Infra / DB
    value: Vercel, Render, Upstash Redis, PostgreSQL, Groq API

description1:
  show: yes
  title: 프로젝트 소개
  text1: >
    여행자를 위한 다중 통화 환율 계산기. 실시간 환율 조회와 나라·박수·여행 스타일에 맞는 AI 여행 팁을 제공한다. 한국어·영어·일본어·스페인어·중국어 5개 언어를 지원한다.
    <br/><br/>
    <a href="https://currency-calculator-web.vercel.app/" target="_blank">🌐 서비스 바로가기</a>

description2:
  show: yes
  title: 주요 기능
  text1: >
    실시간 환율 조회 (Redis Cache-Aside로 API 호출 최소화) <br/>
    AI 여행 조언 — 나라·박수·여행 스타일(저예산/보통/고급)별 맞춤 팁 <br/>
    5개 언어 지원 (KO, EN, JA, ES, ZH)

description3:
  title: 기술 선택 이유
  text2: >
    <strong>Kotlin + Coroutines</strong> — 환율 API·AI API 호출이 모두 외부 네트워크 요청. 코루틴으로 I/O 대기 중 스레드를 블로킹하지 않고 다른 요청을 처리해 동시 처리량 확보.<br/><br/>
    <strong>Spring AI</strong> — AI 제공자를 교체해도 코드 변경 최소화. Gemini → Groq 전환 시 base-url 한 줄만 수정하면 됐다.<br/><br/>
    <strong>Groq API (Llama 3)</strong> — Gemini 프리티어 제한으로 전환. 일일 토큰 제한 없고 상업용 가능. OpenAI 호환 API라 Spring AI와 자연스럽게 연동.<br/><br/>
    <strong>Redis (Upstash)</strong> — 환율·AI 응답 모두 캐싱. 동일 조건 요청은 AI API를 다시 호출하지 않아 비용 절감.<br/><br/>
    <strong>Vercel</strong> — GitHub 푸시만으로 자동 배포 + 글로벌 CDN. 프론트 인프라 관리 불필요.<br/><br/>
    <strong>Render</strong> — 무료 티어로 Spring Boot 배포. 단, 15분 비활성 시 슬립 모드 진입으로 첫 요청이 느릴 수 있다.
---
