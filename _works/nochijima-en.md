---
layout: works-single
title: Nochijima
lang: en
permalink: /en/works/nochijima
category: Ongoing Projects
category_slug: on-going-projects
image: assets/img/works/nochijima/nochijima-thumb.png
short_description: A subscription service that collects Korean government grant announcements daily and emails only the ones that match you

full_image: assets/img/works/nochijima/nochijima-thumb.png
info:
  - label: Period
    value: 2026.08 ~ Live (solo project)
  - label: Backend
    value: Kotlin, Spring Boot 3.3, Spring Data JPA, WebClient, Thymeleaf
  - label: Infra / DB
    value: Render, PostgreSQL (Supabase), UptimeRobot
  - label: External
    value: Brevo (email), PortOne V2 + KG Inicis (recurring payments)
  - label: Scale
    value: 7 Gradle modules · 13.7k LOC · 10.3k test LOC (678 @Test)

description1:
  show: yes
  title: Overview
  text1: >
    Collects government support program announcements posted daily on Bizinfo and K-Startup, and sends each subscriber a morning email with only the announcements that match their <strong>region, field and company profile</strong>.
    <br/><br/>
    Planned, designed, built, deployed and operated solo, including payment integration. Runs on one server and one database at zero infrastructure cost (excluding the domain).
    <br/><br/>
    <a href="https://nochijima.com" target="_blank">🌐 Visit Service</a>
  text2: >
    <strong>Automatic collection</strong> — Pulls new announcements from two public APIs, normalizes region, period and title, and merges duplicates posted on both.<br/><br/>
    <strong>Matching email</strong> — Groups results by match tier and never sends the same announcement twice.<br/><br/>
    <strong>Free / paid plans</strong> — Free: weekly (spread across weekdays). Paid: daily, billed monthly after card registration.<br/><br/>
    <strong>Public announcement pages (SEO)</strong> — Detail pages, region/field listing pages and a sitemap for search traffic.<br/><br/>
    <strong>Self-healing</strong> — Mail retries, payment reconciliation and a daily morning health check.

description2:
  show: yes
  title: Architecture
  description2_image:
    - assets/img/works/nochijima/system-context.png
    - assets/img/works/nochijima/module-dependency.png
    - assets/img/works/nochijima/ports-adapters.png
    - assets/img/works/nochijima/daily-timeline.png
  text1: >
    <strong>Modular monolith</strong> — One server, one database, one deployment. For a solo operator, microservices only multiply deployment, monitoring and failure points. Gradle multi-modules let the compiler block "just import it from there".<br/><br/>
    <strong>Module boundaries</strong> — Each module knows only the shared-types module (no exceptions); wiring modules together is the orchestrator's job alone. Signup must save the subscriber and enqueue the verification mail in one transaction, so the subscription module knows only a "send this mail" port while the orchestrator does the enqueueing inside the same transaction — enforced to fail outside one and covered by tests.
  text2: >
    <strong>Ports and adapters only where needed</strong> — Ports exist only where replacing an external provider is realistic: announcement sources, mail and payments. Matching is a pure function with no port.<br/><br/>
    Calling code knows only the port, so <strong>switching providers changes just an adapter and a setting.</strong><br/><br/>
    <strong>Batch-driven server</strong> — 07:00 collect → 07:55 paid send → 08:00 free send → 09:00 health check. Order is dependency, so each step has slack.

description3:
  title: Design Decisions
  githubgist_url: https://nochijima.com
  text1: 🌐 nochijima.com
  text2: >
    <strong>External calls outside transactions</strong> — With only 5 DB connections, calling mail or payment APIs inside a transaction exhausts the pool. Work is split into save → commit → external call → save result, with writers in separate beans (self-invocation bypasses @Transactional).<br/><br/>
    <strong>Outbox pattern</strong> — Mail is enqueued in the same transaction as business data and sent by a separate job, retrying at 30s → 5m → 30m → 2h.<br/><br/>
    <strong>Payments: record first, verify directly</strong> — Orders are saved as PENDING before calling the PG; payments with unknown results are reconciled against the PG every 30 minutes. Webhooks are signals only, and the charged amount comes from the server record, never the browser.<br/><br/>
    <strong>Duplicates blocked by unique constraints</strong> — Instead of distributed locks, DB constraints prevent re-sending an announcement or re-charging an order, so scaling out stays safe.
---
