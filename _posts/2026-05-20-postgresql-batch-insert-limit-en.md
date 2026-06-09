---
layout: post
title: "PostgreSQL Parameter Limit on Bulk INSERT and Chunk Processing"
date: 2026-05-20
category: error
author: 이소현
lang: en
permalink: /en/blog/postgresql-batch-insert-limit/
---

<br>

> All service-related details in this post have been replaced with dummy data.

<br>

---

## Background

While developing an external health device integration feature, we encountered a situation where health measurement data could reach tens of thousands of records per day. When attempting a single bulk INSERT using MyBatis `<foreach>`, the following error occurred:

```
org.postgresql.util.PSQLException:
  Tried to send an out-of-range integer as a 2-byte value: XXXXXX
```

In practice, about **65,000 records** arrived at once, triggering this error.

---

## Root Cause

PostgreSQL's wire protocol represents the parameter count in a **Bind message** as **Int16 (2 bytes)**.

```
Int16 max value = 2^15 - 1 = 32,767
```

When inserting a large batch via MyBatis `<foreach>`, the total parameter count becomes `rows × columns`. Once this exceeds 32,767, the pgjdbc driver throws an exception when trying to write the parameter count as a 2-byte value.

Example: 65,000 rows × 5–6 columns ≈ 325,000–390,000 parameters → far exceeds the limit (32,767)

---

## Fix

Split into chunks of 10,000 records and process in batches.

```java
private static final int BATCH_CHUNK_SIZE = 10_000;

// INSERT
for (int i = 0; i < toInsert.size(); i += BATCH_CHUNK_SIZE) {
    List<HealthDataProcessor> chunk =
        toInsert.subList(i, Math.min(i + BATCH_CHUNK_SIZE, toInsert.size()));
    healthDataDao.saveHealthData(userSn, chunk);
}

// UPDATE
for (int i = 0; i < toUpdate.size(); i += BATCH_CHUNK_SIZE) {
    List<HealthDataProcessor> chunk =
        toUpdate.subList(i, Math.min(i + BATCH_CHUNK_SIZE, toUpdate.size()));
    healthDataDao.updateHealthData(userSn, chunk);
}
```

---

## Summary

When dealing with high-frequency data, **chunk-based batch processing** is essential — not a simple bulk INSERT.

| Item | Detail |
|---|---|
| Cause | PostgreSQL wire protocol Int16 parameter limit (max 32,767) |
| Formula | rows × columns ≤ 32,767 |
| Fix | Split INSERT/UPDATE into chunks |
| Chunk size | Adjust based on column count per row |

A safe chunk size is `32,767 / column count` or less.

Fortunately, this error was caught in the staging environment before it ever reached production. Lucky.
