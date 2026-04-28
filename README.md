# leesohyeon96.github.io

개인 블로그 겸 포트폴리오 사이트. Jekyll 기반으로 GitHub Pages를 통해 배포되며, 한국어/영어 다국어를 지원한다.

- **URL**: https://leesohyeon96.github.io/
- **테마**: Luique (bslthemes)
- **언어**: 한국어(기본) / 영어

---

## 디렉터리 구조

```
├── _posts/          # 블로그 글 (개발 포스팅 등)
├── _works/          # 프로젝트 포트폴리오
├── _sub/            # 서브 프로젝트 (GitHub Gist 연동)
├── _layouts/        # 레이아웃 템플릿 (post, works-single 등)
├── _includes/       # 공통 컴포넌트 (header, footer, sidebar 등)
├── _sass/           # 스타일 파일
├── _data/           # 사이트 데이터 파일
├── assets/          # 이미지, CSS, JS 등 정적 파일
├── _site/           # Jekyll 빌드 결과물 (자동 생성, 수정 X)
├── en/              # 영문 페이지
├── ko/              # 한국어 페이지
├── _config.yml      # Jekyll 전체 설정
└── Gemfile          # Ruby 의존성
```

---

## 로컬 실행

### 사전 요구사항

- Ruby 설치
- Bundler 설치

```bash
sudo gem install jekyll bundler
```

### 실행

```bash
# 프로젝트 루트에서
bundle install        # 최초 1회 또는 Gemfile 변경 시
bundle exec jekyll serve
```

브라우저에서 `http://localhost:4000` 접속

> `_config.yml`을 수정한 경우 서버를 재시작해야 반영된다.

---

## 콘텐츠 작성

### 블로그 글 (`_posts/`)

파일명 형식: `YYYY-MM-DD-제목.md`
한/영 쌍으로 작성: `파일명.md` + `파일명-en.md`

```yaml
---
layout: post
title: "글 제목"
date: 2026-01-01
category: 개발
author: 이소현
lang: ko                                    # ko 또는 en
permalink: /ko/blog/파일명/
---
```

### 프로젝트 (`_works/`)

한/영 쌍으로 작성: `프로젝트명.md` + `프로젝트명-en.md`
비활성화할 파일은 파일명 앞에 `_` 접두사 붙이기 (예: `_프로젝트명.md`)

```yaml
---
layout: works-single
title: 프로젝트 이름
lang: ko
permalink: /ko/works/프로젝트명
category: 완료된 프로젝트
image: assets/img/works/프로젝트명/대표이미지.png
short_description: 한 줄 설명
---
```

### 서브 프로젝트 (`_sub/`)

GitHub Gist 등 외부 링크 연동용 컬렉션.

---

## 배포

`main` 브랜치에 push하면 GitHub Pages가 자동으로 빌드 및 배포한다.
`_site/` 디렉터리는 빌드 결과물이므로 직접 수정하지 않는다.

---

## 주요 설정 (`_config.yml`)

| 항목 | 값 |
|---|---|
| 사이트 제목 | SHL Dev |
| 기본 언어 | 한국어 (ko) |
| 페이지당 포스트 수 | 6 |
| Google Analytics | G-SZB9ZNHMK1 |
| 타임존 | Asia/Seoul |
