---
layout: post
title: "Meal Query API Timeout — From 19s to 11ms (1,700x Improvement)"
date: 2026-05-14
category: error
author: Sohyeon Lee
description: "A real-world case study of fixing a 19-second meal query API down to 11ms using MATERIALIZED CTE, function indexes, and PostgreSQL planner analysis"
lang: en
permalink: /en/blog/query-performance-improvement/
---

<br>

While operating a wearable-based health data platform, a timeout occurred on the meal query API for specific users. As data accumulated for heavy smartwatch users, response time spiked up to 29 seconds for a small subset of users — the app's HTTP timeout (15s) fired first, leaving the screen blank.

This post covers how I tracked down the root cause with `EXPLAIN ANALYZE`, forced the execution order using a MATERIALIZED CTE, and squeezed out further gains by aligning index expressions.

> 📌 Table names, column names, and metrics in this post have been replaced with dummy data to protect proprietary information. The technical flow and root cause are identical to the real incident.

<br>

---

## Table of Contents

- [Symptoms](#symptoms)
- [Understanding the Structure: Why Only Heavy Smartwatch Users?](#structure)
- [Root Cause: EXPLAIN ANALYZE](#root-cause)
- [Fix 1: MATERIALIZED CTE](#solution)
- [Fix 2: Aligning Index Expressions](#index-fix)
- [Final Results](#results)
- [Prevention Guidelines](#prevention)
- [References](#references)

---

# 🔴 Symptoms {#symptoms}

Customer support report:

> "My meal history screen is blank. Logging out and reinstalling doesn't help."

Only 2 out of all users reproduced the issue. Logging in with the same account on a different device (Android) showed the same blank screen → not a client-side problem.

Server log:

```
GET Meal Query API
→ HTTP 200, body: []
→ Response time: 29,200ms
```

The API returned HTTP 200 — but only after 29 seconds, with an empty array (`[]`). The app's HTTP timeout was 15 seconds.

The server completed the query after 29 seconds, but by then the app had already timed out and closed the connection. The client received nothing and displayed a blank screen. The exact reason `body: []` appeared in the server log was not determined, but the data itself existed normally in the database.

The data existed. It was just **too slow to arrive**.

<br>

---

# 🔍 Understanding the Structure: Why Only Heavy Smartwatch Users? {#structure}

## Data Model

This service stores various health data measured by smartwatches. The table structure looks like this:

```
user_health_info  (health data master — parent table)
  ├── health_sn    PK
  ├── user_id      user identifier
  └── log_type     data type ('TYPE_A', 'TYPE_B', ...)

user_meal_log  (meal data — child table)
  ├── health_sn    FK → user_health_info
  └── meal_data    JSONB
```

`meal_data` JSONB example:

```json
{
  "mealInfo": {
    "mealDate": "2026-05-10T12:30:00",
    "mealType": "LUNCH",
    "calories": 650
  }
}
```

Querying meal data requires a JOIN between `user_meal_log` and `user_health_info`, filtered by `user_id`.

## Why Only These 2 Users?

`user_health_info` stores not just meal records but **all health data types in a unified table**. Wearing a smartwatch throughout the day continuously generates records of various types.

| User | user_health_info rows | Note |
|---|---|---|
| Regular user (no smartwatch) | ~50 rows | Manual meal entries only |
| Light smartwatch user | ~200 rows | Worn occasionally |
| **Affected user A** | **~800 rows** | **Heavy user, wears daily** |
| **Affected user B** | **~400 rows** | **Wears frequently** |

Same query, but performance scaled with **the number of accumulated health data rows per user**. That's why only heavy smartwatch users were affected.

<br>

---

# 🔎 Root Cause: EXPLAIN ANALYZE {#root-cause}

## AS-IS Query

```sql
SELECT
    uml.health_sn,
    uml.meal_data
FROM user_meal_log uml
INNER JOIN user_health_info uli
    ON uml.health_sn = uli.health_sn
WHERE uli.user_id      = #{userId}
  AND (uml.meal_data->'mealInfo'->>'mealDate')::timestamp
          AT TIME ZONE 'Asia/Seoul'
      BETWEEN #{startTime} AND #{endTime}
ORDER BY ...
```

Looks fine on the surface. But `EXPLAIN ANALYZE` reveals the actual execution order is the opposite of what you'd expect.

## EXPLAIN ANALYZE Output (AS-IS)

```
Hash Join
  (actual time=18,543..19,200 rows=126 loops=1)
  Hash Cond: (uml.health_sn = uli.health_sn)

  -- ① full table scan
  ->  Seq Scan on user_meal_log uml
        (actual time=0.018..18,542 rows=126 loops=1)
        Filter: (
          (meal_data->'mealInfo'->>'mealDate')
            ::timestamp AT TIME ZONE 'Asia/Seoul'
          BETWEEN ... AND ...
        )
        Rows Removed by Filter: 14,470  -- ② discarded

  -- ③ user_health_info: index scan (fast)
  ->  Hash
        ->  Index Scan on user_health_info uli
              Index Cond: (user_id = 'user-abc123')

Execution Time: 19,200 ms  -- 19 seconds!
```

## Breaking Down the Actual Execution Order

What PostgreSQL actually did:

```
① Full scan of user_meal_log — all 14,596 rows
   + JSONB parse on every row
   → 14,470 discarded (date mismatch) — 17.5s

② Load user_health_info into Hash (0.2ms)

③ Hash Join 126 rows → user_id filter

Total: 19,200ms
```

The expected execution order was the exact opposite:

```
Expected: filter user_health_info for user_id=user-abc123 first
          → fetch only those health_sn values from user_meal_log
          → JSONB parse: dozens of rows

Actual:   full JSONB parse on user_meal_log first
          → then apply user_id filter
```

## Why Did the Planner Choose Wrong?

The PostgreSQL query planner **estimates costs from statistics**. Two misjudgments combined here:

**Misjudgment 1: JSONB parsing cost underestimated**

The planner's cost model is calibrated around simple comparisons (`integer = 42`). Nested JSONB extraction like `(jsonb->'key'->>'subkey')::timestamp` is far more expensive in practice, but the planner doesn't account for this sufficiently.

**Misjudgment 2: Skewed per-user row distribution**

Most users have very few rows in `user_health_info`. Based on that average, the planner concluded that "filtering user_health_info first would produce many rows to JOIN against" — so it chose to scan `user_meal_log` first. Heavy smartwatch users were statistical outliers the planner didn't anticipate.

The result: planner chose **"scan user_meal_log first because it's cheaper"** — but JSONB parsing made it take 17.5 seconds.

<br>

---

# ✅ Fix 1: MATERIALIZED CTE {#solution}

## CTE vs MATERIALIZED

A **CTE (Common Table Expression)** is a named subquery inside a query:

```sql
WITH name AS (
    SELECT ...
)
SELECT * FROM name ...
```

**Before PostgreSQL 12**: CTEs always ran first as a separate step (optimization fence).  
**PostgreSQL 12+**: CTEs are **inlined by default** — the planner unfolds them and freely reorders execution.

So in PostgreSQL 12+, using a CTE doesn't guarantee execution order.

Adding the **`MATERIALIZED` keyword** forces the CTE to execute first and caches the result before anything else runs.

```sql
WITH name AS MATERIALIZED (  -- ← guaranteed to run first
    SELECT ...
)
```

"Execute this subquery first and hold the result. Everything else works off that."

## Modified Query

```sql
-- TO-BE: MATERIALIZED CTE forces user_health_info first
WITH filtered_user AS MATERIALIZED (
    SELECT health_sn
      FROM user_health_info
     WHERE user_id = #{userId}       -- ① user_id filter first
)
SELECT
    uml.health_sn,
    uml.meal_data
FROM user_meal_log uml
INNER JOIN filtered_user fu
    ON uml.health_sn = fu.health_sn  -- ② small result set
WHERE (uml.meal_data->'mealInfo'->>'mealDate')::timestamp
          AT TIME ZONE 'Asia/Seoul'
      BETWEEN #{startTime} AND #{endTime}
ORDER BY ...
```

## New Execution Order

```
① Run filtered_user CTE:
   filter user_health_info by user_id
   → result: ~10–15 rows (health_sn list for this user)

② Fetch from user_meal_log only for those health_sn values
   → JSONB parsing target: dozens of rows

③ Apply date filter

Total: 53ms
```

## EXPLAIN ANALYZE Output (After MATERIALIZED CTE)

```
Nested Loop
  (actual time=0.312..52.847 rows=126 loops=1)

  ->  CTE Scan on filtered_user fu
        (actual time=0.203..0.287 rows=10 loops=1)
        CTE filtered_user
          ->  Index Scan on user_health_info
                Index Cond: (user_id = 'user-abc123')

  -- ② Seq Scan → Index Scan!
  ->  Index Scan on user_meal_log uml
        (actual time=5.218..5.231 rows=13 loops=10)
        Index Cond: (health_sn = fu.health_sn)
        Filter: ( ...mealDate BETWEEN... )
        Rows Removed by Filter: 64

Execution Time: 52.847 ms  -- 53ms!
```

`Seq Scan` became `Index Scan`. JSONB parsing now targets only the rows belonging to this user (~130 rows) instead of the entire table (14,596 rows).

**19,200ms → 53ms — about 360x faster.**

<br>

---

# 🔧 Fix 2: Aligning Index Expressions {#index-fix}

After reaching 53ms, I noticed the date condition was still being evaluated as a `Filter` rather than an `Index Cond`. Fixing that would unlock further improvement.

## Index Cond vs Filter

```
->  Index Scan on user_meal_log
      -- narrows rows via index
      Index Cond: (health_sn = fu.health_sn)
      -- applied in memory after row fetch (64 discarded)
      Filter: (...mealDate...)::timestamp BETWEEN ...
      Rows Removed by Filter: 64
```

| | Index Cond | Filter |
|---|---|---|
| Where evaluated | Inside B-Tree traversal | In memory after row fetch |
| Unnecessary row reads | None (excluded at index level) | Yes (read then discarded) |
| Impact as data grows | Gradual | Proportional to data growth |

For the date condition to become an `Index Cond`, an index must exist **and the query expression must exactly match the index expression**.

## Existing Index

`user_meal_log` already had a functional index for date lookups:

```sql
-- existing functional index
CREATE INDEX idx_user_meal_log_mealdate
    ON user_meal_log
    (health_sn, fn_meal_mealdate(meal_data));

-- fn_meal_mealdate function definition
CREATE OR REPLACE FUNCTION fn_meal_mealdate(meal_data jsonb)
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
    SELECT SUBSTRING(
      meal_data->'mealInfo'->>'mealDate', 1, 10
    )::date
$$;
```

This index uses the expression `fn_meal_mealdate(meal_data)`, which returns a `date`.

## Why the Index Wasn't Used

The AS-IS WHERE clause:

```sql
AND (uml.meal_data->'mealInfo'->>'mealDate')::timestamp
        AT TIME ZONE 'Asia/Seoul'
    BETWEEN #{startTime} AND #{endTime}
```

- **Index expression**: `fn_meal_mealdate(meal_data)` → returns `date`
- **Query expression**: `(meal_data->'mealInfo'->>'mealDate')::timestamp AT TIME ZONE 'Asia/Seoul'` → returns `timestamptz`

Same logical result, but **the expressions don't match as strings**. PostgreSQL requires the expression to match **exactly** to use a functional index.

The parameter type was also a problem. `#{startTime}` arrives as `timestamptz` (`2026-05-10T00:00:00+09:00`), while the index returns `date` — another mismatch.

## Fix: Match the Index Expression

```sql
-- TO-BE: use fn_meal_mealdate() to match the index
AND fn_meal_mealdate(uml.meal_data)
    >= (#{startTime}::timestamptz
           AT TIME ZONE 'Asia/Seoul')::date

AND fn_meal_mealdate(uml.meal_data)
    <= (#{endTime}::timestamptz
           AT TIME ZONE 'Asia/Seoul')::date
```

- Left side: `fn_meal_mealdate(uml.meal_data)` — exactly matches the index expression
- Right side: cast the `timestamptz` parameter to a Seoul-based `date`

`startTime = 2026-05-10T00:00:00+09:00` → `(::timestamptz AT TIME ZONE 'Asia/Seoul')::date` → `2026-05-10`

## EXPLAIN ANALYZE Output (After Index Expression Alignment)

```
Nested Loop
  (actual time=0.215..11.342 rows=126 loops=1)

  ->  CTE Scan on filtered_user fu
        (actual time=0.178..0.234 rows=10 loops=1)

  ->  Index Scan on user_meal_log uml
        (actual time=1.012..1.021 rows=13 loops=10)
        -- Filter → Index Cond!
        Index Cond: (
          health_sn = fu.health_sn
          AND fn_meal_mealdate(meal_data)
              >= '2026-05-10'::date
          AND fn_meal_mealdate(meal_data)
              <= '2026-05-10'::date
        )

Execution Time: 11.342 ms  -- 11ms!
```

The date condition moved from `Filter` to `Index Cond`. The 64 rows that were previously fetched and discarded are now excluded at the index level.

**53ms → 11ms — about 5x additional improvement.**

<br>

---

# 📊 Final Results {#results}

| Stage | Execution Time | Notes |
|---|---|---|
| AS-IS | 19,433ms | Seq Scan + full JSONB parse (14,596 rows) |
| MATERIALIZED CTE | 53ms | ~360x improvement |
| Index expression alignment | 11ms | ~5x additional improvement |

```
19,433ms → 53ms → 11ms  (total ~1,700x improvement)
```

**Before vs after:**

- Before: app timeout fires (15s) → blank screen
- After: 11ms → instant load, same as any other user

The same parent-child table pattern existed across other health domain queries. All were updated with the same fix.

<br>

---

# 🛡️ Prevention Guidelines {#prevention}

For any query with this parent-child table structure, apply the following:

**❌ Anti-pattern — child table first, user_id filter after JOIN**

```sql
FROM user_meal_log uml                       -- child table first
INNER JOIN user_health_info uli ON ...
WHERE uli.user_id = #{userId}  -- after JOIN
  AND (uml.meal_data->...->>'...')::timestamp
```

**✅ Pattern 1 — parent table first (simple queries)**

```sql
FROM user_health_info uli                   -- parent table first
INNER JOIN user_meal_log uml ON ...
WHERE uli.user_id = #{userId}  -- filter first
```

**✅ Pattern 2 — MATERIALIZED CTE (complex filter conditions)**

```sql
WITH filtered_user AS MATERIALIZED (
    SELECT health_sn
      FROM user_health_info
     WHERE user_id = #{userId}
)
SELECT ...
  FROM user_meal_log uml
 INNER JOIN filtered_user fu ON uml.health_sn = fu.health_sn
 WHERE fn_meal_mealdate(uml.meal_data)
    BETWEEN ...  -- matches index expression
```

**Index expression consistency rule:**  
When creating a functional index, document the exact expression intended for use in queries. Any deviation — even one that produces identical results — will cause the index to be ignored.

<br>

---

Key takeaways from this incident:

**First, trust the PostgreSQL planner — but verify.**  
The planner tends to underestimate the cost of nested JSONB extraction. When data distribution is skewed, it can choose a suboptimal plan. Run `EXPLAIN ANALYZE` on slow queries first, and use `MATERIALIZED CTE` to explicitly control execution order when needed.

**Second, a functional index is only used when the expression matches exactly.**  
Two expressions that return the same result are not interchangeable for index purposes. When creating a functional index, think about exactly how the query will reference it.

<br>

---

# 📚 References {#references}

**PostgreSQL MATERIALIZED CTE**
- [PostgreSQL 12 Release Notes — WITH Queries](https://www.postgresql.org/docs/12/release-12.html) — CTE inlining default change
- [PostgreSQL Docs: WITH Queries (CTEs)](https://www.postgresql.org/docs/current/queries-with.html) — MATERIALIZED / NOT MATERIALIZED

**Reading EXPLAIN ANALYZE**
- [PostgreSQL Docs: EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html)
- [Use The Index, Luke: PostgreSQL Execution Plans](https://use-the-index-luke.com/sql/explain-plan/postgresql/getting-an-execution-plan)

**Functional Indexes (Expression Indexes)**
- [PostgreSQL Docs: Indexes on Expressions](https://www.postgresql.org/docs/current/indexes-expressional.html)

**JSONB Performance**
- [PostgreSQL Docs: JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)
- [Waiting for PostgreSQL 12 – Allow MATERIALIZED option for CTEs](https://www.depesz.com/2019/05/30/waiting-for-postgresql-12-allow-materialized-option-for-ctes/)
