---
layout: post
title: "블로그 글 작성 가이드"
date: 2024-12-19
category: 개념
image: assets/img/blog/blog-2.jpg
author: 이소현
lang: ko
permalink: /ko/blog/blog-writing-guide/
---

# 블로그 글 작성 가이드

이 가이드는 Jekyll 블로그에 새로운 글을 작성하는 방법을 설명합니다.

## 📝 **글 작성 방법**

### **1. 파일 생성**
`_posts_ko/YYYY/` 또는 `_posts_en/YYYY/` 폴더에 새로운 Markdown 파일을 생성합니다.

**파일명 규칙**: `MM-DD-제목.md`
- 예: `12-19-my-new-post.md`

### **2. Front Matter 작성**

```yaml
---
layout: post
title: "글 제목"
date: 2024-12-19
category: 개발  # 카테고리 (필수)
image: assets/img/blog/blog-2.jpg  # 썸네일 이미지
author: 이소현
lang: ko  # ko: 한국어, en: 영어
---
```

### **3. 카테고리 옵션**
- `개발`: 개발 관련
- `개념`: 개념 설명
- `에러`: 에러 해결
- `자유`: 자유로운 이야기

### **4. 폴더 구조**
```
_posts_ko/
├── 2024/
│   ├── 12-19-blog-writing-guide.md
│   └── 12-20-development-sample.md
└── 2025/
    └── 01-15-new-year-post.md

_posts_en/
├── 2024/
│   ├── 12-19-blog-writing-guide.md
│   └── 12-20-development-sample.md
└── 2025/
    └── 01-15-new-year-post.md
```

이제 블로그에 글을 작성해보세요! 🚀 