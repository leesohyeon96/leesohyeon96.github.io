---
layout: post
title: "식사 조회 API 타임아웃 — 19초에서 11ms로 (1,700배 개선)"
date: 2026-05-14
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/query-performance-improvement/
---

<br>

웨어러블 기반 건강 데이터 플랫폼을 운영하던 중, 특정 사용자의 식사 조회 API에서 타임아웃이 발생했다. 스마트워치 헤비유저의 데이터가 누적되면서 일부 사용자에 한해 응답 시간이 최대 29초까지 치솟았고, 앱 HTTP 타임아웃(15초)이 먼저 발동해 화면이 빈 채로 표시됐다.

이 글은 `EXPLAIN ANALYZE`로 원인을 찾아가는 과정, MATERIALIZED CTE로 실행 순서를 강제한 방법, 그리고 인덱스 표현식 통일로 추가 개선한 과정을 정리한 기록이다.

> 📌 이 글에 등장하는 테이블명, 컬럼명, 수치 등은 실제 서비스 정보를 보호하기 위해 더미 데이터로 대체했습니다. 기술적 흐름과 핵심 원인은 실제와 동일합니다.

<br>

---

## 목차

- [현상](#symptoms)
- [구조 이해: 왜 스마트워치 헤비유저만?](#structure)
- [원인 분석: EXPLAIN ANALYZE](#root-cause)
- [해결 1: MATERIALIZED CTE](#solution)
- [해결 2: 인덱스 표현식 통일](#index-fix)
- [최종 결과](#results)
- [재발 방지 기준](#prevention)
- [참고 자료](#references)

---

# 🔴 현상 {#symptoms}

CS 인입 내용:

> "식사 기록을 조회하면 화면이 빈 채로 표시됩니다. 로그아웃/재설치해도 동일합니다."

확인해보니 전체 사용자 중 특정 2명에게서만 재현됐다. 다른 기기(Android)로 로그인해도 동일하게 빈 화면 → 클라이언트 문제 아님.

서버 로그:

```
GET 식사 조회 API
→ HTTP 200, body: []
→ 응답시간: 29,200ms
```

API는 200을 반환하고 있었다. 하지만 29초 소요 후 빈 배열. 앱 HTTP 타임아웃(15초)이 먼저 발동해 클라이언트는 응답을 받지 못하고 빈 화면을 표시한 것이다.

데이터가 실제로 없는 게 아니라 **응답이 너무 늦어서 버려진 것**이었다.

<br>

---

# 🔍 구조 이해: 왜 스마트워치 헤비유저만? {#structure}

## 데이터 모델

이 서비스는 스마트워치에서 측정한 다양한 건강 데이터를 저장한다. 테이블 구조는 다음과 같다.

```
user_health_info  (건강 데이터 기본 정보 — 상위 테이블)
  ├── health_sn    PK
  ├── user_id      사용자 식별자
  └── log_type     로그 타입 ('TYPE_A', 'TYPE_B', ...)

user_meal_log  (식사 데이터 — 하위 테이블)
  ├── health_sn    FK → user_health_info
  └── meal_data    JSONB
```

`meal_data` JSONB 구조 예시:

```json
{
  "mealInfo": {
    "mealDate": "2026-05-10T12:30:00",
    "mealType": "LUNCH",
    "calories": 650
  }
}
```

식사 데이터를 조회할 때는 `user_meal_log`와 `user_health_info`를 JOIN해서 `user_id`로 필터링한다.

## 왜 특정 사용자 2명만 문제였나

`user_health_info`는 식사 데이터뿐 아니라 **모든 건강 데이터 타입을 통합 저장**한다. 스마트워치를 착용하고 생활하면 다양한 타입의 건강 데이터가 지속적으로 기록된다.

| 사용자 | user_health_info 행 수 | 비고 |
|---|---|---|
| 일반 사용자 (스마트워치 미사용) | ~50행 | 수동 입력 식사 기록만 존재 |
| 스마트워치 라이트 유저 | ~200행 | 간헐적 착용 |
| **문제 사용자 A** | **~800행** | **스마트워치 헤비유저, 매일 착용** |
| **문제 사용자 B** | **~400행** | **스마트워치 자주 착용** |

같은 쿼리인데 특정 사용자만 느린 이유가 이 때문이다. 쿼리 성능이 **해당 사용자의 누적 건강 데이터 행 수**에 비례했다.

<br>

---

# 🔎 원인 분석: EXPLAIN ANALYZE {#root-cause}

## AS-IS 쿼리 구조

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

겉으로는 문제없어 보인다. 그런데 `EXPLAIN ANALYZE`를 돌리면 실행 순서가 예상과 다르다.

## EXPLAIN ANALYZE 결과 (AS-IS)

```
Hash Join
  (cost=29.42..4,218.76 rows=12 width=312)
  (actual time=18,543.221..19,200.334 rows=126 loops=1)
  Hash Cond: (uml.health_sn = uli.health_sn)

  ->  Seq Scan on user_meal_log uml           ← ① 전체 테이블 스캔
        (cost=0.00..4,180.14 rows=14,596 width=320)
        (actual time=0.018..18,542.883 rows=126 loops=1)
        Filter: (
          (meal_data->'mealInfo'->>'mealDate')::timestamp
              AT TIME ZONE 'Asia/Seoul'
          BETWEEN '2026-05-10 00:00:00+09' AND '2026-05-10 23:59:59+09'
        )
        Rows Removed by Filter: 14,470          ← ② 14,470건 읽고 버림

  ->  Hash
        (cost=29.30..29.30 rows=10 width=16)
        (actual time=0.203..0.203 rows=10 loops=1)
        ->  Index Scan on user_health_info uli  ← ③ 인덱스 스캔 (빠름)
              Index Cond: (user_id = 'user-abc123')
              Rows Removed by Filter: 792

Planning Time:   0.412 ms
Execution Time: 19,200.334 ms       ← 19초!
```

## 실제 실행 순서 해석

PostgreSQL이 선택한 실행 계획:

```
① user_meal_log 전체 14,596행 풀스캔
   + 각 행마다 JSONB 파싱 (meal_data->'mealInfo'->>'mealDate')::timestamp
   → 14,470건은 날짜 조건 불일치로 버림 (17.5초 소요)

② user_health_info를 Hash로 읽어 메모리에 올림 (0.2ms)

③ ①의 결과(126행)와 Hash Join → user_id 필터

총 19,200ms
```

기대했던 실행 순서는 정반대였다.

```
기대: user_health_info에서 user_id=user-abc123 먼저 필터
     → 해당 health_sn 수십 개만 user_meal_log에서 조회
     → JSONB 파싱 대상: 수십 건

실제: user_meal_log 전체를 먼저 JSONB 파싱
     → 그 다음 user_id 필터
```

## 왜 플래너가 잘못된 계획을 세웠나

PostgreSQL 쿼리 플래너는 **통계 정보 기반으로 비용을 추정**한다. 이 경우 두 가지 오판이 겹쳤다.

**오판 1: JSONB 파싱 비용 과소평가**

플래너의 통계 모델은 단순 컬럼 비교(`integer = 42`)를 기준으로 비용을 계산한다. `(jsonb->'key'->>'subkey')::timestamp` 같은 중첩 파싱은 실제로 훨씬 비싸지만, 플래너는 이를 충분히 반영하지 못한다.

**오판 2: 사용자별 데이터 분포 차이**

`user_health_info`의 user_id 분포를 보면 대부분 row 수가 적다. 플래너는 이 평균을 기반으로 "user_health_info에서 user_id 필터 후 JOIN하면 많은 row를 처리해야 한다"고 판단해 `user_meal_log`를 먼저 읽는 계획을 선택했다. 하지만 헤비유저는 평균을 벗어난 케이스였다.

결과적으로 플래너는 **"user_meal_log를 먼저 읽는 것이 싸다"** 고 판단했고, 실제로는 JSONB 파싱 때문에 17.5초가 걸렸다.

<br>

---

# ✅ 해결 1: MATERIALIZED CTE {#solution}

## CTE와 MATERIALIZED의 차이

**CTE(Common Table Expression)** 는 쿼리 안에서 임시로 이름 붙인 서브쿼리다.

```sql
WITH 이름 AS (
    SELECT ...
)
SELECT * FROM 이름 ...
```

**PostgreSQL 12 이전**: CTE는 항상 별도로 먼저 실행됐다 (optimization fence).  
**PostgreSQL 12 이후**: 기본적으로 **인라인(inline)** 처리 — 플래너가 CTE를 펼쳐서 자유롭게 실행 순서를 최적화한다.

즉, PostgreSQL 12+에서 CTE를 쓴다고 실행 순서가 보장되지 않는다.

**`MATERIALIZED` 키워드**를 붙이면 CTE를 먼저 실행하고 결과를 임시 저장하도록 강제한다.

```sql
WITH 이름 AS MATERIALIZED (  -- ← 이 부분 먼저 실행 보장
    SELECT ...
)
```

"이 서브쿼리 결과를 먼저 구해놔. 나머지는 그 결과를 가지고 해."

## 수정된 쿼리

```sql
-- TO-BE: user_health_info를 MATERIALIZED CTE로 먼저 실행
WITH filtered_user AS MATERIALIZED (
    SELECT health_sn
      FROM user_health_info
     WHERE user_id     = #{userId}       -- ① user_id 필터 가장 먼저
)
SELECT
    uml.health_sn,
    uml.meal_data
FROM user_meal_log uml
INNER JOIN filtered_user fu
    ON uml.health_sn = fu.health_sn   -- ③ 소수 행으로만 JOIN
WHERE (uml.meal_data->'mealInfo'->>'mealDate')::timestamp
          AT TIME ZONE 'Asia/Seoul'
      BETWEEN #{startTime} AND #{endTime}
ORDER BY ...
```

## 변경 후 실행 순서

```
① filtered_user CTE 실행:
   user_health_info에서 user_id 필터
   → 결과: 약 10~15행 (해당 사용자의 health_sn 목록)

② user_meal_log에서 filtered_user의 health_sn에 해당하는 행만 조회
   → JSONB 파싱 대상: 수십 건

③ 날짜 필터 적용

총 53ms
```

## EXPLAIN ANALYZE 결과 (MATERIALIZED CTE 적용 후)

```
Nested Loop
  (cost=12.43..58.21 rows=8 width=312)
  (actual time=0.312..52.847 rows=126 loops=1)

  ->  CTE Scan on filtered_user fu
        (cost=8.21..8.41 rows=10 width=8)
        (actual time=0.203..0.287 rows=10 loops=1)

        CTE filtered_user
          ->  Index Scan on user_health_info
                (actual time=0.018..0.198 rows=10 loops=1)
                Index Cond: (user_id = 'user-abc123')
  
  ->  Index Scan on user_meal_log uml          ← ② 인덱스 스캔으로 변경!
        (cost=4.22..4.98 rows=1 width=320)
        (actual time=5.218..5.231 rows=13 loops=10)
        Index Cond: (health_sn = fu.health_sn)
        Filter: (
          (meal_data->'mealInfo'->>'mealDate')::timestamp
              AT TIME ZONE 'Asia/Seoul'
          BETWEEN ...
        )
        Rows Removed by Filter: 64

Planning Time:   0.318 ms
Execution Time: 52.847 ms       ← 53ms!
```

`Seq Scan`이 `Index Scan`으로 바뀌었고, JSONB 파싱 대상이 전체 테이블(14,596행)에서 해당 사용자의 행(약 130행)으로 줄었다.

**19,200ms → 53ms, 약 360배 개선.**

<br>

---

# 🔧 해결 2: 인덱스 표현식 통일 {#index-fix}

53ms로 개선됐지만 EXPLAIN ANALYZE를 보면 날짜 조건이 아직 `Filter`로 처리되고 있다. `Index Cond`로 바꾸면 추가 개선이 가능하다.

## Index Cond vs Filter

```
->  Index Scan on user_meal_log
      Index Cond: (health_sn = fu.health_sn)   ← 인덱스로 행 좁힘
      Filter: (meal_data->'mealInfo'->>'mealDate')::timestamp ...
              BETWEEN ...                          ← 행 읽은 후 메모리에서 필터
      Rows Removed by Filter: 64                  ← 64건 읽고 버림
```

| | Index Cond | Filter |
|---|---|---|
| 처리 위치 | B-Tree 탐색 중 | 행 fetch 이후 메모리 |
| 불필요한 행 조회 | 없음 (인덱스에서 이미 제외) | 있음 (읽고 나서 버림) |
| 데이터 증가 영향 | 완만 | 데이터 증가에 비례 |

날짜 조건을 `Index Cond`로 처리하려면 해당 컬럼에 **인덱스가 있어야 하고, 쿼리 표현식이 인덱스 표현식과 정확히 일치**해야 한다.

## 기존 인덱스 구조

`user_meal_log`에는 날짜 조회를 위한 함수 인덱스가 이미 존재했다.

```sql
-- 기존 함수 인덱스
CREATE INDEX idx_user_meal_log_mealdate
    ON user_meal_log (health_sn, fn_meal_mealdate(meal_data));

-- fn_meal_mealdate 함수 정의
CREATE OR REPLACE FUNCTION fn_meal_mealdate(meal_data jsonb)
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
    SELECT SUBSTRING(meal_data->'mealInfo'->>'mealDate', 1, 10)::date
$$;
```

이 인덱스는 `fn_meal_mealdate(meal_data)` 표현식으로 `date` 타입을 반환한다.

## 왜 인덱스가 안 쓰였나

AS-IS 쿼리의 날짜 조건:

```sql
AND (uml.meal_data->'mealInfo'->>'mealDate')::timestamp
        AT TIME ZONE 'Asia/Seoul'
    BETWEEN #{startTime} AND #{endTime}
```

- **인덱스 표현식**: `fn_meal_mealdate(meal_data)` → `date` 반환
- **쿼리 표현식**: `(meal_data->'mealInfo'->>'mealDate')::timestamp AT TIME ZONE 'Asia/Seoul'` → `timestamptz` 반환

결과값은 같은 날짜를 나타내지만 **표현식 자체가 다르다**. PostgreSQL은 표현식이 **문자열 수준에서 정확히 일치**해야 함수 인덱스를 사용한다.

추가로, 파라미터 타입도 문제였다. `#{startTime}`이 `timestamptz` 형태(`2026-05-10T00:00:00+09:00`)로 넘어오는데 인덱스는 `date`를 반환하므로 타입 비교에서도 표현식 불일치가 발생했다.

## 수정: 인덱스 표현식과 일치

```sql
-- TO-BE: fn_meal_mealdate() 함수로 통일
AND fn_meal_mealdate(uml.meal_data)
    >= (#{startTime}::timestamptz AT TIME ZONE 'Asia/Seoul')::date

AND fn_meal_mealdate(uml.meal_data)
    <= (#{endTime}::timestamptz AT TIME ZONE 'Asia/Seoul')::date
```

- 좌변: `fn_meal_mealdate(uml.meal_data)` → 인덱스 표현식과 완전 일치
- 우변: 파라미터(`timestamptz`)를 서울 기준 `date`로 변환

`startTime`이 `2026-05-10T00:00:00+09:00`이면 `(::timestamptz AT TIME ZONE 'Asia/Seoul')::date` → `2026-05-10`

## EXPLAIN ANALYZE 결과 (인덱스 표현식 통일 후)

```
Nested Loop
  (actual time=0.215..11.342 rows=126 loops=1)

  ->  CTE Scan on filtered_user fu
        (actual time=0.178..0.234 rows=10 loops=1)

  ->  Index Scan on user_meal_log uml
        (actual time=1.012..1.021 rows=13 loops=10)
        Index Cond: (                              ← Filter → Index Cond 으로 변경!
          (health_sn = fu.health_sn)
          AND (fn_meal_mealdate(meal_data) >= '2026-05-10'::date)
          AND (fn_meal_mealdate(meal_data) <= '2026-05-10'::date)
        )

Planning Time:   0.284 ms
Execution Time: 11.342 ms       ← 11ms!
```

날짜 조건이 `Filter`에서 `Index Cond`로 바뀌었다. 불필요하게 읽던 64건이 인덱스 단계에서 제거된다.

**53ms → 11ms, 추가 약 5배 개선.**

<br>

---

# 📊 최종 결과 {#results}

| 단계 | 실행 시간 | 비고 |
|---|---|---|
| AS-IS | 19,433ms | Seq Scan + 전체 JSONB 파싱 (14,596건) |
| MATERIALIZED CTE 적용 | 53ms | 약 360배 개선 |
| 인덱스 표현식 통일 | 11ms | 추가 5배 개선 |

```
19,433ms → 53ms → 11ms  (총 약 1,700배 개선)
```

**개선 전후 체감 차이:**

- 개선 전: 앱 타임아웃 발동(15초) → 빈 화면
- 개선 후: 11ms → 일반 사용자와 동일하게 즉시 표시

스마트워치 헤비유저 증가에 따라 동일한 부모-자식 테이블 구조를 가진 다른 도메인 쿼리들도 같은 패턴으로 전체 개선했다.

<br>

---

# 🛡️ 재발 방지 기준 {#prevention}

이 구조(상위 테이블 → 하위 테이블 관계)를 가진 쿼리 작성 시 아래 패턴 적용:

**❌ 금지 패턴 — 하위 테이블 먼저, user_id 조건이 JOIN 이후**

```sql
FROM user_meal_log uml                       -- 하위 테이블 먼저
INNER JOIN user_health_info uli ON ...
WHERE uli.user_id = #{userId}                -- user_id 필터가 JOIN 이후
  AND (uml.meal_data->...->>...)::timestamp  -- 전체 테이블에 JSONB 파싱
```

**✅ 권장 패턴 1 — 상위 테이블 먼저 (단순 조회)**

```sql
FROM user_health_info uli                   -- 상위 테이블 먼저
INNER JOIN user_meal_log uml ON ...
WHERE uli.user_id = #{userId}               -- user_id 필터 먼저 적용
```

**✅ 권장 패턴 2 — MATERIALIZED CTE (복잡한 필터 조건이 있을 때)**

```sql
WITH filtered_user AS MATERIALIZED (
    SELECT health_sn
      FROM user_health_info
     WHERE user_id     = #{userId}
)
SELECT ...
  FROM user_meal_log uml
 INNER JOIN filtered_user fu ON uml.health_sn = fu.health_sn
 WHERE fn_meal_mealdate(uml.meal_data) BETWEEN ...  -- 인덱스 표현식 그대로 사용
```

**인덱스 표현식 통일 원칙:**  
함수 인덱스를 만들 때 쿼리에서 어떤 표현식으로 사용할지 함께 문서화. 표현식이 조금이라도 다르면 인덱스가 무용지물이 된다.

<br>

---

이번 개선에서 얻은 핵심 교훈:

**첫째, PostgreSQL 플래너를 신뢰하되 맹신하지 말 것.**  
JSONB 중첩 파싱 비용은 플래너가 과소평가하는 경향이 있다. 데이터 분포가 편향된 경우 플래너가 잘못된 실행 계획을 세울 수 있다. 느린 쿼리를 만나면 `EXPLAIN ANALYZE`로 실제 실행 계획을 먼저 확인하고, 필요하면 `MATERIALIZED CTE`로 실행 순서를 직접 제어한다.

**둘째, 인덱스는 표현식까지 정확히 일치해야 활용된다.**  
같은 결과를 반환하더라도 표현식이 다르면 인덱스가 무시된다. `EXPLAIN ANALYZE`에서 `Index Cond`와 `Filter`를 구분하는 것이 중요하다.

<br>

---

# 📚 참고 자료 {#references}

**PostgreSQL MATERIALIZED CTE**
- [PostgreSQL 12 Release Notes — WITH Queries](https://www.postgresql.org/docs/12/release-12.html) — CTE inlining 기본값 변경 내용
- [PostgreSQL Docs: WITH Queries (CTEs)](https://www.postgresql.org/docs/current/queries-with.html) — MATERIALIZED / NOT MATERIALIZED 설명

**EXPLAIN ANALYZE 읽는 법**
- [PostgreSQL Docs: EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html)
- [Use The Index, Luke: PostgreSQL Execution Plans](https://use-the-index-luke.com/sql/explain-plan/postgresql/getting-an-execution-plan)

**함수 인덱스 (Expression Index)**
- [PostgreSQL Docs: Indexes on Expressions](https://www.postgresql.org/docs/current/indexes-expressional.html)

**JSONB 성능**
- [PostgreSQL Docs: JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)
- [Waiting for PostgreSQL 12 – Allow MATERIALIZED option for CTEs](https://www.depesz.com/2019/05/30/waiting-for-postgresql-12-allow-materialized-option-for-ctes/)
