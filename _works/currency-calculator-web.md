---
layout: works-single
title: Currency Calculator (환율 계산기)
lang: ko
permalink: /ko/works/currency-calculator-web
category: 완료된 프로젝트
category_slug: completed-projects
image: assets/img/works/currency-calculator-web/currency-calculator-thumb.png
short_description: 여행자를 위한 실시간 환율 계산기 + AI 여행 조언

live_preview: https://currency-calculator-web.vercel.app/
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
  text1: 여행자를 위한 다중 통화 환율 계산기. 실시간 환율 조회와 나라·박수·여행 스타일에 맞는 AI 여행 팁을 제공한다. 한국어·영어·일본어·스페인어·중국어 5개 언어를 지원한다.

description2:
  show: yes
  title: 주요 기능
  text1: >
    실시간 환율 조회 (Redis Cache-Aside로 API 호출 최소화) <br/>
    AI 여행 조언 (Groq API + Spring AI, Redis 캐싱으로 비용 절감) <br/>
    5개 언어 지원 (i18next) <br/>

description3:
  title: 기술적 선택
  text1: >
    Kotlin 코루틴으로 환율 API·AI API 비동기 호출을 논블로킹으로 처리했다. 
    AI는 Gemini에서 Groq(Llama 3)로 전환 — OpenAI 호환 API라 Spring AI base-url만 변경하면 됐다. 
    Render 무료 티어 슬립 모드로 첫 요청이 느릴 수 있다.
---
