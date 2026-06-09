---
layout: post
title: "Claude Code Harness Engineering: Building Your Own AI Dev Environment"
date: 2026-05-22
category: 개발
author: 이소현
description: "How to build a personalized AI dev environment by wiring custom hooks, skills, and memory systems into Claude Code"
lang: en
permalink: /en/blog/claude-code-harness-engineering/
---

<br>

The default Claude Code setup eventually falls short — you find yourself repeating the same instructions, or stepping in to prevent the same mistakes over and over. **Harness Engineering** is the practice of solving this by combining Claude Code's configuration systems (hooks, plugins, CLAUDE.md, skills) to automate your AI development workflow.

<br>

---

## Table of Contents

- [Configuration Layers](#config-layers)
- [CLAUDE.md: Defining AI Behavior Rules](#claude-md)
- [Hooks: Event-Based Automation](#hooks)
- [Plugins: Feature Extensions](#plugins)
- [Skills: Reusable Workflows](#skills)
- [Additional Customization](#extras)
- [Summary](#summary)

---

# 🔧 Configuration Layers {#config-layers}

Claude Code customization is organized into four layers.

| Layer | File/Location | Role |
|---|---|---|
| **Rules** | `~/.claude/CLAUDE.md` | Define AI behavior rules |
| **Hooks** | `~/.claude/settings.json` | Event-based automation |
| **Plugins** | `settings.json > enabledPlugins` | Feature extensions |
| **Skills** | `~/.claude/skills/` | Reusable workflows |

<br>

---

# 📋 CLAUDE.md: Defining AI Behavior Rules {#claude-md}

`~/.claude/CLAUDE.md` is a global rules file Claude Code reads at the start of every session. Define your collaboration preferences here once — no need to repeat them every conversation.

```markdown
# Global Rules

## Communication
- Respond in Korean
- Keep answers short and to the point

## Coding
- No comments by default
- No unnecessary abstraction or refactoring
- Error handling only when actually needed

## Role (Workflow)
- I handle implementation — design comes from Codex
- No code review comments (Codex handles reviews)
- Check with me before changing design decisions during implementation
```

The key is **role separation**. Assigning Claude Code to implementation and Codex to design/review lets each AI operate in its area of strength.

<br>

---

# 🪝 Hooks: Event-Based Automation {#hooks}

Hooks are the core automation mechanism in Claude Code. They run shell commands when specific events occur.

## Supported Events

| Event | When it fires |
|---|---|
| `SessionStart` | Claude Code session starts |
| `Stop` | Task completes |
| `PermissionRequest` | Tool execution needs approval |
| `PostToolUseFailure` | Tool execution fails |
| `PreToolUse` | Just before a tool runs |
| `UserPromptSubmit` | User submits a prompt |

<br>

## SessionStart: Session Banner

```json
{
  "type": "command",
  "command": "echo ''; echo '  /\\_/\\  '; echo ' ( o.o ) '; echo '  > ^ <  Claude Code ready. Meow.'; echo ''"
}
```

Prints a cat ASCII art banner every time a session starts.

<br>

## Stop: macOS Task Complete Notification

```json
{
  "type": "command",
  "command": "elapsed=$((now - start)); if [ $elapsed -gt 30 ]; then terminal-notifier -title \"Claude Code\" -message \"✅ Task complete (${elapsed}s)\"; fi"
}
```

Fires a macOS notification only when task duration exceeds 30 seconds. Lets you walk away from long tasks and get notified when they finish.

![Claude Code task complete notification](/assets/img/blog/claude-code-notification.png)

<br>

## PreToolUse: Compile Check Before Commit

```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "command": "cmd=$(jq -r '.tool_input.command'); if echo \"$cmd\" | grep -qE '^git commit'; then if [ -f './gradlew' ]; then ./gradlew classes -q 2>&1 || echo '{\"continue\": false, \"stopReason\": \"Compile error. Fix before committing.\"}'; fi; fi"
  }]
}
```

Runs `./gradlew classes` before every `git commit`. If there's a compile error, the commit is blocked entirely. This is a **guardrail that prevents Claude Code from committing broken code**.

<br>

---

# 🔌 Plugins: Feature Extensions {#plugins}

Plugins are packages that extend Claude Code's capabilities. Register them in `settings.json` under `enabledPlugins`.

## Plugins in Use

**superpowers** — The most essential plugin. Foundation of the Skills system; provides structured workflows for TDD, debugging, brainstorming, and more.

**hookify** — Simplifies hook management. Can analyze conversation history and automatically suggest hook rules.

**caveman** — Compresses Claude Code's responses into terse caveman-style output, reducing token usage by ~75%. Toggle with `/caveman`.

**session-report** — Generates an HTML report of session token usage, cache hit rate, subagent calls, and more.

**claude-md-management** — Audits and optimizes CLAUDE.md files.

**jdtls-lsp / kotlin-lsp** — Java/Kotlin LSP integration. Allows Claude Code to analyze code symbols more accurately.

<br>

---

# 🎯 Skills: Reusable Workflows {#skills}

Skills are markdown files that define the procedure Claude Code follows for specific tasks. Stored in `~/.claude/skills/` and invoked via `/skill-name`.

Skills provided by plugins are automatically loaded into every session — you don't manually invoke them. Claude applies them based on context.

For example, the `systematic-debugging` skill from `superpowers` enforces a hypothesis → verify → fix sequence whenever a bug or test failure is encountered.

Skills that auto-trigger by context:
- `superpowers:systematic-debugging` — on bugs or test failures
- `superpowers:writing-plans` — before multi-step tasks
- `superpowers:verification-before-completion` — forces verification before claiming work is done
- `caveman:caveman` — token-saving mode

<br>

---

# ✨ Additional Customization {#extras}

## Spinner Messages

```json
"spinnerVerbs": {
  "mode": "replace",
  "verbs": [
    "Thinking...", "Purring...", "Paw-sing...",
    "Napping on it...", "Kneading the code..."
  ]
}
```

Replaces the default spinner text shown while Claude is thinking with custom messages.

## Custom Status Line

```json
"statusLine": {
  "type": "command",
  "command": "bash ~/.claude/hooks/caveman-statusline.sh"
}
```

Runs a custom script that displays caveman mode status (and other info) in the terminal status bar.

<br>

---

# 💡 Summary {#summary}

The core idea of harness engineering is **automating the points where AI repeatedly makes mistakes**.

- CLAUDE.md defines baseline behavior rules
- Hooks provide guardrails (compile checks, notifications)
- Plugins extend functionality
- Skills enforce structured workflows

Set it up once and Claude Code operates to your preferences without needing repeated instructions.
