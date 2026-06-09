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
    AI travel tips — personalized by country, nights, and travel style (budget/normal/luxury) <br/>
    5-language support (KO, EN, JA, ES, ZH)

description3:
  title: Why These Technologies
  text2: >
    <strong>Kotlin + Coroutines</strong> — Exchange rate and AI API calls are both external network requests. Coroutines suspend during I/O waits without blocking threads, enabling higher concurrency with fewer resources.<br/><br/>
    <strong>Spring AI</strong> — Abstracts AI provider details so switching providers requires minimal code changes. Migrating Gemini → Groq only needed a single base-url update.<br/><br/>
    <strong>Groq API (Llama 3)</strong> — Switched from Gemini due to free-tier limits. Groq offers no daily token cap and allows commercial use. OpenAI-compatible API integrates naturally with Spring AI.<br/><br/>
    <strong>Redis (Upstash)</strong> — Caches both exchange rates and AI responses. Identical requests skip the AI API entirely, cutting costs.<br/><br/>
    <strong>Vercel</strong> — Auto-deploys on every GitHub push with global CDN included. Zero frontend infra management needed.<br/><br/>
    <strong>Render</strong> — Hosts the Spring Boot API on a free tier. Note: spins down after 15 minutes of inactivity, causing a slow first request.
---
