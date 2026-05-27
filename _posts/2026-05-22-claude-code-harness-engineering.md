---
layout: post
title: "Claude Code 하네스 엔지니어링: 나만의 AI 개발환경 만들기"
date: 2026-05-22
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/claude-code-harness-engineering/
---

<br>

Claude Code를 쓰다 보면 기본 설정만으로는 아쉬운 순간들이 생긴다. 반복적으로 같은 말을 해야 하거나, AI가 실수를 예방하려면 매번 직접 개입해야 하는 상황들. 이런 문제를 해결하기 위해 **하네스 엔지니어링(Harness Engineering)** 이라는 개념을 적용해봤다.

하네스 엔지니어링이란 Claude Code의 설정 시스템(hooks, plugins, CLAUDE.md, skills)을 조합해 나만의 AI 개발 워크플로우를 자동화하는 것이다.

<br>

---

# 🔧 설정 구조 한눈에 보기

Claude Code의 커스터마이징은 크게 네 가지 레이어로 이뤄진다.

| 레이어 | 파일/위치 | 역할 |
|---|---|---|
| **Rules** | `~/.claude/CLAUDE.md` | AI 행동 규칙 정의 |
| **Hooks** | `~/.claude/settings.json` | 이벤트 기반 자동화 |
| **Plugins** | `settings.json > enabledPlugins` | 기능 확장 |
| **Skills** | `~/.claude/skills/` | 재사용 가능한 워크플로우 |

<br>

---

# 📋 CLAUDE.md: AI 행동 규칙 정의

`~/.claude/CLAUDE.md`는 Claude Code가 매 세션마다 읽는 글로벌 규칙 파일이다. 여기에 원하는 협업 방식을 명시해두면 매번 설명할 필요가 없어진다.

```markdown
# Global Rules

## Communication
- 한국어로 대화
- 답변은 짧고 핵심만

## Coding
- 주석 기본적으로 달지 않기
- 불필요한 추상화/리팩토링 하지 않기
- 에러 핸들링은 실제 필요한 경우만

## 역할 (워크플로우)
- 나는 코드 구현 담당 — 설계는 Codex가 한 것을 기반으로 함
- 코드 리뷰 코멘트 작성 금지 (리뷰는 Codex 담당)
- 구현 중 설계 변경이 필요하면 사용자에게 먼저 확인
```

포인트는 **역할 분리**다. Claude Code는 구현, Codex는 설계/리뷰라는 명확한 분업을 설정해두면 각 AI의 강점을 잘 활용할 수 있다.

<br>

---

# 🪝 Hooks: 이벤트 기반 자동화

Hooks는 Claude Code의 핵심 자동화 도구다. 특정 이벤트가 발생할 때 쉘 명령을 실행한다.

## 지원 이벤트

| 이벤트 | 발생 시점 |
|---|---|
| `SessionStart` | Claude Code 세션 시작 시 |
| `Stop` | 작업 완료 시 |
| `PermissionRequest` | 도구 실행 승인 요청 시 |
| `PostToolUseFailure` | 도구 실행 실패 시 |
| `PreToolUse` | 도구 실행 직전 |
| `UserPromptSubmit` | 사용자 프롬프트 제출 시 |

<br>

## SessionStart: 세션 시작 알림

```json
{
  "type": "command",
  "command": "echo ''; echo '  /\\_/\\  '; echo ' ( o.o ) '; echo '  > ^ <  Claude Code ready. Meow.'; echo ''"
}
```

세션 시작할 때마다 고양이 아스키 아트가 출력된다.

<br>

## Stop: 작업 완료 macOS 알림

```json
{
  "type": "command",
  "command": "elapsed=$((now - start)); if [ $elapsed -gt 30 ]; then terminal-notifier -title \"Claude Code\" -message \"✅ Task complete (${elapsed}s)\"; fi"
}
```

작업 시간이 30초 이상일 때만 macOS 알림을 보낸다. 긴 작업을 시켜두고 다른 일을 하다가 알림으로 완료를 확인하는 방식.

![Claude Code 작업 완료 알림](/assets/img/blog/claude-code-notification.png)

<br>

## PreToolUse: 커밋 전 컴파일 체크

```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "command": "cmd=$(jq -r '.tool_input.command'); if echo \"$cmd\" | grep -qE '^git commit'; then if [ -f './gradlew' ]; then ./gradlew classes -q 2>&1 || echo '{\"continue\": false, \"stopReason\": \"컴파일 에러가 있습니다.\"}'; fi; fi"
  }]
}
```

`git commit` 명령이 실행되기 전에 `./gradlew classes`로 컴파일 체크를 먼저 수행한다. 컴파일 에러가 있으면 커밋 자체를 막는다. **Claude Code가 잘못된 코드를 커밋하는 사고를 방지**하는 가드레일 역할.

<br>

---

# 🔌 Plugins: 기능 확장

Plugins는 Claude Code의 기능을 확장하는 패키지다. `settings.json`의 `enabledPlugins`에 등록해 사용한다.

## 사용 중인 플러그인

**superpowers** — 가장 핵심 플러그인. Skills 시스템의 기반이 되며, TDD/디버깅/브레인스토밍 등 체계적인 워크플로우를 제공한다.

**hookify** — Hooks를 더 쉽게 관리하게 해주는 플러그인. 대화 기록을 분석해서 자동으로 hook 규칙을 제안해주기도 한다.

**caveman** — Claude Code의 응답을 압축된 동굴인 스타일로 바꿔주는 플러그인. 토큰 사용량을 ~75% 줄여준다. `/caveman` 명령으로 on/off 가능.

**session-report** — 세션의 토큰 사용량, 캐시 히트율, 서브에이전트 호출 등을 HTML 리포트로 생성해준다.

**claude-md-management** — CLAUDE.md 파일을 감사하고 최적화해준다.

**jdtls-lsp / kotlin-lsp** — Java/Kotlin LSP 통합. Claude Code가 코드 심볼을 더 정확하게 분석할 수 있게 된다.

<br>

---

# 🎯 Skills: 재사용 가능한 워크플로우

Skills는 Claude Code가 특정 작업을 수행할 때 따르는 절차를 정의한 마크다운 파일이다. `~/.claude/skills/` 디렉토리에 저장되며, `/skill-name` 명령으로 호출한다.

예를 들어 `superpowers` 플러그인이 제공하는 `systematic-debugging` 스킬은 버그를 만났을 때 가설 수립 → 검증 → 수정의 체계적인 절차를 Claude Code가 따르도록 강제한다.

자주 쓰는 스킬들:
- `superpowers:systematic-debugging` — 버그/테스트 실패 시
- `superpowers:writing-plans` — 멀티스텝 작업 시작 전
- `superpowers:verification-before-completion` — 완료 주장 전 검증 강제
- `caveman:caveman` — 토큰 절약 모드

<br>

---

# ✨ 기타 커스터마이징

## 스피너 메시지

```json
"spinnerVerbs": {
  "mode": "replace",
  "verbs": [
    "Thinking...", "Purring...", "Paw-sing...",
    "Napping on it...", "Kneading the code..."
  ]
}
```

Claude가 생각하는 동안 보이는 스피너 메시지를 커스텀 텍스트로 교체한다.

## 커스텀 상태바

```json
"statusLine": {
  "type": "command",
  "command": "bash ~/.claude/hooks/caveman-statusline.sh"
}
```

터미널 하단 상태바에 caveman 모드 활성화 여부 등을 표시하는 커스텀 스크립트.

<br>

---

# 💡 마무리

하네스 엔지니어링의 핵심은 **AI가 반복적으로 실수하는 지점을 자동화로 막는 것**이다.

- CLAUDE.md로 기본 행동 규칙 정의
- Hooks로 컴파일 체크, 알림 등 안전장치 구축
- Plugins로 기능 확장
- Skills로 체계적인 워크플로우 강제

한 번 세팅해두면 매 세션마다 같은 지시를 반복할 필요가 없다.
