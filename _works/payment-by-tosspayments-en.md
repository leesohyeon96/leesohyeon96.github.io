---
layout: works-single
title: Toss Payments Integration Demo
lang: en
permalink: /en/works/payment-by-tosspayments
category: Completed Projects
category_slug: completed-projects
image: assets/img/works/payment-by-tosspayments/toss-thumb.png
short_description: Payment system demo integrating Toss Payments API — order to approval and cancellation

full_image: assets/img/works/payment-by-tosspayments/toss-thumb.png
info:
  - label: Period
    value: 2026.06.07 ~ 2026.06.09
  - label: Language / Framework
    value: Kotlin, Spring Boot 3.3, Spring Data JPA
  - label: Security / Auth
    value: Spring Security + JWT (Access + Refresh Token)
  - label: DB / Deploy
    value: PostgreSQL (Neon), Railway

description1:
  show: yes
  title: Overview
  text1: >
    A payment system demo integrating the Toss Payments API. Covers the full payment flow: sign up, log in, create an order, integrate the payment widget, confirm/cancel payment, and view payment history.
    <br/><br/>
    <a href="https://payment-by-tosspayments-production-6d2b.up.railway.app" target="_blank">🌐 Live Demo</a>

description2:
  show: yes
  title: Key Features
  text1: >
    Sign up / Login (JWT Access + Refresh Token) <br/>
    Order creation <br/>
    Toss Payments widget integration <br/>
    Payment confirmation / cancellation <br/>
    Payment history <br/>
    Auto-expiry of incomplete payments (scheduler)

description3:
  title: Why These Technologies
  text2: >
    <strong>Kotlin + Spring Boot</strong> — In the payment domain, a null handling mistake can mean an outage. Kotlin null safety enforces correctness at compile time, and its concise syntax expresses domain objects clearly.<br/><br/>
    <strong>Toss Payments</strong> — Best-in-class developer documentation and fully equipped test mode. Chosen to learn the real payment flow (request → confirmation → refund) and error handling.<br/><br/>
    <strong>JWT (Access + Refresh Token)</strong> — Current industry standard and a frequent interview topic. Stateless design makes horizontal scaling easy.<br/><br/>
    <strong>PostgreSQL (Neon)</strong> — Payment data requires transactions and consistency → RDB. Neon is free with permanent data retention (Railway built-in DB deletes after 90 days).<br/><br/>
    <strong>Thymeleaf</strong> — Toss SDK is called from the frontend so a UI is required. React would be overkill; Spring built-in avoids a separate deployment.
---
