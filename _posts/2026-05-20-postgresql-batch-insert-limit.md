---
layout: post
title: "PostgreSQL 대량 INSERT 시 파라미터 제한과 Chunk 처리"
date: 2026-05-20
category: 개발
author: 이소현
lang: ko
permalink: /ko/blog/postgresql-batch-insert-limit/
---

<br>

> 이 글은 실제 서비스 관련 정보를 더미 데이터로 대체했습니다.

<br>

---

## 배경

외부 건강 기기 연동 기능 개발 중, 건강 측정 데이터가 하루치만 해도 수만 건씩 들어오는 상황이 발생했다. 실제로 한 번에 약 **65,000건**이 들어왔고, MyBatis `<foreach>`로 한 번에 INSERT를 시도했더니 아래 에러가 발생했다.

```
org.postgresql.util.PSQLException:
  Tried to send an out-of-range integer as a 2-byte value: XXXXXX
```

---

## 원인

PostgreSQL wire protocol의 **Bind 메시지**는 파라미터 수를 **Int16(2바이트)**으로 표현한다.

```
Int16 최대값 = 2^15 - 1 = 32,767
```

수만 건을 MyBatis `<foreach>`로 한 번에 INSERT하면 파라미터 총합이 `건수 × 컬럼 수`가 된다. 이 값이 32,767을 초과하는 순간, pgjdbc 드라이버가 파라미터 수를 2바이트로 write하는 시점에 범위 초과로 예외를 던진다.

예시: 컬럼 5~6개짜리 데이터 65,000건 → 파라미터 약 325,000~390,000개 → 한도(32,767) 대폭 초과

---

## 해결

10,000건 단위로 잘라서 배치 처리하도록 수정했다.

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

## 정리

고빈도 데이터를 다룰 때는 단순 bulk INSERT가 아닌 **chunk 단위 배치 처리**가 필수다.

| 항목 | 내용 |
|---|---|
| 원인 | PostgreSQL wire protocol Int16 파라미터 수 제한 (최대 32,767) |
| 공식 | 건수 × 컬럼 수 ≤ 32,767 |
| 해결 | chunk 단위로 분할 INSERT/UPDATE |
| chunk size | 1건당 컬럼 수에 따라 조정 필요 |

적절한 chunk size는 `32,767 / 컬럼 수`를 넘지 않도록 설정하면 안전하다.

다행히 이 에러는 상용이 아닌 스테이징 환경에서 먼저 발견했다. 운이 좋았다.
