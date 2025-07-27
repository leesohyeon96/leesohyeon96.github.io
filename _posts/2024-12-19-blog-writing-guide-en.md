---
layout: post
title: "Blog Writing Guide"
date: 2024-12-19
category: concept
image: assets/img/blog/blog-2.jpg
author: Sohyeon Lee
lang: en
permalink: /en/blog/blog-writing-guide/
---

# Blog Writing Guide

This guide explains how to write new posts for the Jekyll blog.

## 📝 **How to Write Posts**

### **1. Create File**
Create a new Markdown file in the `_posts_ko/YYYY/` or `_posts_en/YYYY/` folder.

**File naming rule**: `MM-DD-title.md`
- Example: `12-19-my-new-post.md`

### **2. Write Front Matter**

```yaml
---
layout: post
title: "Post Title"
date: 2024-12-19
category: development  # Category (required)
image: assets/img/blog/blog-2.jpg  # Thumbnail image
author: Sohyeon Lee
lang: en  # ko: Korean, en: English
---
```

### **3. Category Options**
- `development`: Development related
- `concept`: Concept explanation
- `error`: Error solving
- `free`: Free stories

### **4. Folder Structure**
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

Now you can write blog posts! 🚀 