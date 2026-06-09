---
layout: post
title: "여행자를 위한 환율 계산기 — 사이드 프로젝트 회고"
date: 2026-06-09
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/currency-calculator-project/
---

<br>

여행 전날 환율 계산하려고 앱 켰다가, 불필요한 광고와 복잡한 UI에 질려서 직접 만들기로 했다. 사이드 프로젝트로 Kotlin 코루틴과 Spring AI를 실제로 써보고 싶기도 했고.

<br>

---

## 무엇을 만들었나

환율 조회 + AI 여행 조언 기능을 갖춘 여행자용 다중 통화 계산기.

- 실시간 환율 조회 (Redis 캐싱으로 API 호출 최소화)
- 국가·박수·여행 스타일에 맞는 AI 여행 팁
- 5개 언어 지원 (KO, EN, JA, ES, ZH)

---

## 기술 스택

### 프론트엔드 — Vercel 배포

| 기술 | 용도 |
|---|---|
| React 19 + Vite | UI 빌드 |
| Tailwind CSS | 스타일링 |
| i18next | 다국어 처리 |
| framer-motion | 애니메이션 |
| Capacitor | 모바일 앱 빌드 대응 |

Vercel은 GitHub 푸시만 하면 자동 배포 + CDN까지 처리해줘서 프론트는 신경 쓸 게 없었다.

### 백엔드 — Render 배포

| 기술 | 용도 |
|---|---|
| Spring Boot 3.2.5 + Kotlin 1.9.20 | API 서버 |
| WebFlux + Coroutines | 비동기 처리 |
| Redis (Upstash) | 환율·AI 응답 캐싱 |
| PostgreSQL | 에러 로그 저장 |
| Spring AI | AI 연동 추상화 |

---

## 왜 Kotlin을 선택했나

핵심은 **코루틴**이다.

환율 API 호출, AI API 호출이 모두 외부 네트워크 요청이다. 스레드 기반으로 처리하면 I/O 대기 중에 스레드가 블로킹된다. 코루틴은 대기 중에 suspend하고 다른 코루틴을 실행하다가, 응답이 오면 resume한다.

```kotlin
suspend fun getExchangeRates(baseCurrency: String): Map<String, Double> {
    return withContext(Dispatchers.IO) {
        val response = webClient.get()
            .uri("$apiBaseUrl/$baseCurrency")
            .retrieve()
            .awaitBody<JsonNode>()  // 여기서 suspend -> resume
        processResponse(response)
    }
}
```

스레드를 늘리지 않아도 동시 요청을 처리할 수 있고, 코드는 동기 코드처럼 읽힌다.

---

## AI 연동 — Groq API

처음엔 Gemini를 쓰려 했는데, 프리 티어 제한 때문에 **Groq**로 전환했다. Groq는 Llama 3 모델을 무료로 제공하고 일일 토큰 제한이 없으며 상업용으로도 사용 가능하다.

Groq는 OpenAI API와 호환되기 때문에, Spring AI의 spring-ai-openai-starter를 그대로 쓰고 base-url만 Groq 엔드포인트로 변경했다.

```yaml
spring:
  ai:
    openai:
      api-key: ${GROQ_API_KEY}
      base-url: https://api.groq.com/openai
```

AI 응답은 Redis에 캐싱한다. 나라·박수·여행 스타일 조합이 같으면 API를 다시 호출하지 않는다.

---

## 캐싱 전략

환율 데이터는 자주 바뀌지 않아서 Cache-Aside 패턴으로 Redis에 저장하고 TTL을 설정했다.

AI 응답은 비용이 높으므로 더 적극적으로 캐싱한다. 같은 조건의 여행 팁은 한 번 생성하면 재사용한다.

```
요청 -> Redis hit  -> 캐시 반환
     -> Redis miss -> AI API 호출 -> Redis 저장 -> 반환
```

---

## 배포 구성

```
[사용자]
    |
[Vercel - React 앱]
    | API 요청
[Render - Spring Boot API]
    |- exchangerate-api.com (환율)
    |- Groq API (AI 여행 조언)
    \- Upstash Redis (캐싱)
```

Render 무료 티어는 15분 비활성 시 슬립 모드에 들어간다. 첫 요청 응답이 느릴 수 있는데, 이건 무료 플랜의 한계라 감수했다.

---

## 마치며

실제로 배포해서 쓰다 보니 생각보다 환율 API가 자주 바뀌지 않는다는 걸 체감했고, Redis 캐싱의 효과가 분명하게 느껴졌다. Kotlin 코루틴도 처음에는 낯설었는데, 비동기 흐름을 동기 코드처럼 쓸 수 있다는 게 확실히 편하다.

다음엔 환율 알림 기능이나 여행 히스토리 저장 같은 기능을 추가해볼 생각이다.
