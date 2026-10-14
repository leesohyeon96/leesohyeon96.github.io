# PR 자동 리뷰봇 만들기 (쉽게)

## 이게 뭐예요?

동료가 PR 에 나를 리뷰어로 걸면, **Claude 가 3분마다 확인해서 대신 리뷰를 달아 주는** 봇이에요.
리뷰는 **내 이름으로** 달려요.

```
동료가 나를 리뷰어로 지정
        ▼
Claude 가 3분마다 "나한테 온 리뷰 있나?" 확인
        ▼
있으면 → 코드 읽고 → 리뷰 남김
   ├ 괜찮음   → 승인 ✅
   └ 위험함   → 승인 안 하고 나를 @불러요 🚨
        ▼
리뷰가 달리면 목록에서 빠져서 두 번 리뷰하지 않아요
```

> 내 PC 의 Claude Desktop 이 돌리는 거라 **PC 가 켜져 있을 때만** 동작해요.

---

## 준비물 (3개)

| 준비물 | 확인 방법 |
|---|---|
| Claude Desktop (회사 계정 로그인) | 앱이 열리면 OK |
| GitHub CLI `gh` 로그인 | 터미널에 `gh auth status` → "Logged in" 이 보이면 OK |
| 빈 폴더 하나 | 예: `C:\review-bot` |

---

## 1단계. 폴더에 파일 3개 넣기

봇한테 줄 **설명서 3장**이라고 생각하면 돼요.

```
C:\review-bot\
├─ CLAUDE.md                  ← 📖 "리뷰는 이렇게 해" (규칙)
├─ desktop-instruction.txt    ← 📝 "지금 이거 한 번 해" (매번 주는 지시)
└─ .claude\settings.json      ← 🔒 "이 명령만 써도 돼" (허락 목록)
```

아래 내용을 **그대로 복사**해서 만드세요. `<내아이디>` 만 내 GitHub 아이디로 바꾸면 돼요.

### 📖 `CLAUDE.md` — 규칙

```markdown
# PR 리뷰 규칙

## 기본 스탠스
- 승인이 기본값. diff 를 빠르게 훑고 바로 코멘트한다.
- 아래 셋이 확인될 때만 승인하지 않는다: **보안 · 데이터 손실 · 런타임 파손**
- 그 외(스타일·문서 미비·특정 조건에서만 터지는 위험)는 승인과 함께 한 줄 코멘트.

## 리뷰 본문 형식
(무엇을 위주로 봤는지 한 줄) 승인합니다.   ← 보류면 "승인을 보류합니다"

**확인한 것**
- diff 근거 항목

**한 줄 메모**          ← 있을 때만

**확인하지 않은 것**
- 이번에 보지 않은 범위

## 매 실행 동작
1. `gh search prs --review-requested=@me --state=open --json repository,number,title,isDraft`
2. 비어 있으면 아무 말 없이 끝낸다. draft 는 건너뛴다.
3. PR 마다 `gh pr diff <번호> --repo <owner/repo>` 를 읽고 판단한다.
   - 문제 없음 → `gh pr review <번호> --repo <owner/repo> --approve --body '<본문>'`
   - 심각함 → `gh pr review <번호> --repo <owner/repo> --comment --body '<본문>'`
     본문 첫 줄: `@<내아이디> 확인 필요 — <한 줄 이유>`
4. 처리한 PR 을 `번호 · 제목 · 조치` 한 줄씩 출력한다.

## 명령 사용 규칙 (무인 실행 — 허락 창이 뜨면 멈춘다)

### 셸 고르기 — 실행 중인 OS 에 맞춘다
시작할 때 내 실행 환경(OS · 쓸 수 있는 셸 도구)을 보고 아래 순서로 고른다.

| OS | 쓸 셸 | 리뷰 본문 넘기는 법 |
|---|---|---|
| macOS · Linux | **Bash** | `--body '…'` (작은따옴표) |
| Windows + Bash 도구 있음 (Git for Windows) | **Bash** (우선) | `--body '…'` (작은따옴표) |
| Windows + Bash 도구 없음 | PowerShell | `--body '…'` (작은따옴표 — PowerShell 에서 백틱이 이스케이프로 안 먹는 유일한 방법) |

- Windows 에서 Bash 를 우선하는 이유: PowerShell 은 백틱(`` ` ``)이 이스케이프 문자라 마크다운 코드 표기가 든 본문이 깨지기 쉽고, 여러 줄 본문이면 허용 규칙이 있어도 허락을 다시 물을 수 있다.
- 한 실행 안에서 셸을 섞지 않는다.

### 공통
- 쓰는 명령은 `gh search prs` · `gh pr view` · `gh pr diff` · `gh pr review` 네 개뿐.
- `;` `&&` `|` 로 잇지 않는다. `cd` 를 붙이지 않고 항상 `--repo` 를 쓴다.
- 파일을 만들지 않는다(`>`, `mkdir`, heredoc, `Out-File` 금지).
- 리뷰 본문은 `--body` 로 직접 넘긴다. 본문에 작은따옴표를 쓰지 않는다.
- 머지 · 닫기 · 푸시는 절대 하지 않는다.
```

### 📝 `desktop-instruction.txt` — 매번 주는 지시

```
이 폴더의 CLAUDE.md 에 적힌 "매 실행 동작" 을 한 번 수행해.
- 리뷰 요청된 열린 PR 이 없으면 아무 말 없이 끝낸다.
- CLAUDE.md 의 "명령 사용 규칙" 을 지킨다: 실행 중인 OS 에 맞는 셸을 고르고(Bash 우선), gh 명령만, 한 번에 하나씩, 리뷰 본문은 --body '…'.
- 머지 · 닫기 · 푸시는 절대 하지 않는다.
- 끝나면 처리한 PR 을 "번호 · 제목 · 조치" 한 줄씩만 출력한다.
```

### 🔒 `.claude\settings.json` — 허락 목록

`.claude` 폴더를 만들고 그 안에 넣어요. **내 컴퓨터 OS 에 맞는 것 하나만** 골라서 쓰세요.

**🍎 macOS · 🐧 Linux** — Bash 만 허락하면 돼요.

```json
{
  "permissions": {
    "allow": [
      "Bash(gh search prs *)",
      "Bash(gh pr view *)",
      "Bash(gh pr diff *)",
      "Bash(gh pr review *)",
      "Read"
    ],
    "deny": [
      "Bash(gh pr merge *)",
      "Bash(gh pr close *)",
      "Bash(git push *)"
    ]
  }
}
```

**🪟 Windows** — Bash 와 PowerShell **둘 다** 허락해요.
Claude 는 실행할 때마다 Bash 를 쓰기도 하고 PowerShell 을 쓰기도 해요. 한쪽만 허락하면 다른 쪽으로 실행된 날 허락을 묻고 멈춰요.

```json
{
  "permissions": {
    "allow": [
      "Bash(gh search prs *)",
      "Bash(gh pr view *)",
      "Bash(gh pr diff *)",
      "Bash(gh pr review *)",
      "PowerShell(gh search prs *)",
      "PowerShell(gh pr view *)",
      "PowerShell(gh pr diff *)",
      "PowerShell(gh pr review *)",
      "Read"
    ],
    "deny": [
      "Bash(gh pr merge *)",
      "Bash(gh pr close *)",
      "Bash(git push *)",
      "PowerShell(gh pr merge *)",
      "PowerShell(gh pr close *)",
      "PowerShell(git push *)"
    ]
  }
}
```

> 💡 Windows 라면 **Git for Windows** 를 깔아 두세요(`git --version` 이 나오면 이미 있어요). 그래야 Claude 가 Bash 를 쓸 수 있고, 리뷰 본문이 덜 깨져요. 규칙(`CLAUDE.md`)에 "OS 보고 셸 골라" 를 넣어 뒀으니 Claude 가 알아서 Bash 를 먼저 써요.

> 💡 **왜 허락 목록이 필요해요?** 봇은 혼자 돌아요. 그런데 Claude 가 "이 명령 써도 돼요?" 하고 물으면 대답할 사람이 없어서 **그 자리에서 멈춰요.** 그래서 쓸 명령은 미리 허락하고, 위험한 명령(머지·닫기·푸시)은 미리 막아 둬요.

---

## 2단계. Claude Desktop 에 알람 맞추기

"3분마다 1단계 설명서대로 해" 라고 알람을 맞추는 거예요.

1. Claude Desktop → **Code** 탭 → **Routines** → **New routine**
2. **Local** 선택 (Cloud 아님!)
3. 입력
   | 칸 | 넣을 것 |
   |---|---|
   | 이름 | `pr-review-bot` |
   | 지시문 | `desktop-instruction.txt` 내용 붙여넣기 |
   | 폴더 | `C:\review-bot` |
   | 주기 | 일단 `Hourly` 로 저장 |
4. Desktop 대화창에 이렇게 입력 (3분마다로 바꾸기):
   ```
   pr-review-bot 작업 스케줄을 cron "*/3 8-16 * * 1-5" 로 바꿔줘
   ```
   → 평일 아침 8시 ~ 오후 5시, 3분마다
5. **Run now** 눌러서 한 번 돌려 보기
   → 허락 창이 뜨면 **"항상 허용"** ⚠️ 이걸 안 누르면 다음부터 멈춰요
6. Desktop **설정** → **시작 시 자동 실행** 켜기 (PC 켜면 알아서 시작)

---

## 3단계. 잘 되는지 확인

동료에게 PR 하나 리뷰 요청해 달라고 하고 확인하세요.

- [ ] 리뷰가 **내 이름**으로 달렸어요
- [ ] 나한테 요청 안 온 PR 은 안 건드렸어요
- [ ] 위험한 PR 이면 승인 없이 나를 @불렀어요

---

## 안 될 때

| 이럴 때 | 여기를 보세요 |
|---|---|
| 리뷰가 안 달려요 | Desktop 사이드바 **Scheduled** → 실행 기록이 "허락 대기"에 멈춰 있나? → 열어서 **항상 허용** |
| 허락 창이 계속 떠요 | ① 허락 목록이 내 OS 용인지 (Windows 인데 Bash 만 넣었나?) ② Claude 가 명령을 섞어 썼는지(`cd …;` `\|` `>`) — 그러면 `CLAUDE.md` 의 "명령 사용 규칙" 에 한 줄 더 적어 주세요 |
| 퇴근하면 안 돌아요 | 정상이에요. PC 가 켜져 있을 때만 돌아요 |

---

## ⚠️ 꼭 알아 두기

- **봇이 승인하면 바로 머지할 수 있어요.** (머지 조건이 "승인 1명"이면) 그래서 규칙에 "확인하지 않은 것" 을 꼭 적게 해 뒀어요.
- **봇은 내 이름으로 리뷰해요.** 봇이 남긴 리뷰도 내 책임이에요. 가끔 어떤 리뷰가 달렸는지 훑어 보세요.
