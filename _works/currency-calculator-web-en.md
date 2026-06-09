---
layout: works-single
title: Currency Calculator
lang: en
permalink: /en/works/currency-calculator-web
category: Completed Projects
category_slug: completed-projects
image: assets/img/works/currency-calculator-web/currency-calculator-thumb.png
short_description: Real-time currency calculator with AI travel tips for travelers

full_image: assets/img/works/currency-calculator-web/currency-calculator-thumb.png
info:
  - label: Period
    value: 2026.05 ~ 2026.06
  - label: Frontend
    value: React 19, Vite, Tailwind CSS, i18next, framer-motion
  - label: Backend
    value: Spring Boot 3.2.5, Kotlin, WebFlux + Coroutines, Spring AI
  - label: Infra / DB
    value: Vercel, Render, Upstash Redis, PostgreSQL, Groq API

description1:
  show: yes
  title: Overview
  text1: >
    A multi-currency calculator for travelers. Provides real-time exchange rates and AI-powered travel tips tailored by country, nights, and travel style. Supports 5 languages — Korean, English, Japanese, Spanish, and Chinese.
    <br/><br/>
    <a href="https://currency-calculator-web.vercel.app/" target="_blank">🌐 Live Demo</a>

description2:
  show: yes
  title: Key Features
  text1: >
    Real-time exchange rates (Redis Cache-Aside to minimize API calls) <br/>
    AI travel advice (Groq API + Spring AI, Redis-cached to reduce cost) <br/>
    5-language support (i18next)

description3:
  title: Technical Decisions
  text2: >
    Kotlin coroutines handle exchange rate API and AI API calls asynchronously without blocking threads.
    Switched from Gemini to Groq (Llama 3) — since Groq is OpenAI-compatible, only the base-url needed changing in Spring AI.
    First request may be slow due to Render free-tier sleep mode.
---
