---
layout: post
title: "SRT/KTX Booking System Implementation & JMeter Load Test"
date: 2026-02-01
category: free
#image: assets/img/blog/default.png
author: Sohyeon Lee
lang: en
permalink: /en/blog/train-reservations-jmeter-test/
---

## 🎯 Project Overview

I implemented the design described in [SRT/KTX Booking System Design](/en/blog/how-to-reserve-srt-or-ktx/) and conducted load testing using JMeter.

---

## 📦 GitHub Repository

<a href="https://github.com/leesohyeon96/train-reservations-jmeter-test" target="_blank">🔗 train-reservations-jmeter-test</a>

---

## 🚀 Step-by-Step Improvements

### Step1: Basic Implementation
- **Tech Stack**: JPA + Pessimistic Lock
- **Purpose**: Basic concurrency control testing
- **Issues**: Performance degradation and deadlocks under high traffic

### Step2: Redis Queue Introduction
- **Tech Stack**: JPA + Redis Queue + Lua Script
- **Improvements**: 
  - Resolved concurrency conflicts
  - Guaranteed reservation order
- **Key**: Atomic processing with Lua scripts

### Step3: Performance Optimization
- **Tech Stack**: JPA + Redis Cluster + Enhanced Batch Processing
- **Improvements**:
  - Redis Connection Pool optimization (max 20 connections)
  - Batch size: 100 → **500**
  - Processing interval: 500ms → **200ms**
  - Worker threads: 4 → **8**
  - Seat information caching (TTL: 30 minutes)
  - Reservation history caching (TTL: 5 minutes)

### Step4-1: RabbitMQ Introduction
- **Tech Stack**: JPA + Redis (Inventory) + RabbitMQ
- **Features**:
  - Direct Exchange
  - Dead Letter Queue (DLQ)
  - Message persistence
  - Management UI

### Step4-2: Kafka Introduction
- **Tech Stack**: JPA + Redis (Inventory) + Kafka
- **Features**:
  - Parallel processing with 3 partitions
  - Consumer Group-based scaling
  - Order guarantee within partitions
  - High throughput

---

## 📊 Step4-1 vs Step4-2 Comparison

| Item | RabbitMQ | Kafka |
|------|----------|-------|
| Structure | Exchange → Queue | Topic → Partition |
| Order Guarantee | Within queue | Within partition |
| Throughput | Medium | Very High |
| Scalability | Increase consumers | Increase partitions |
| Features | Dead Letter Queue | Offset management |

---

## 🧪 Testing Method

1. Run infrastructure with Docker Compose (Redis/RabbitMQ/Kafka)
2. Run application
3. Execute JMeter test plan
4. Check performance metrics

---

## 📝 Related Posts

- [SRT/KTX Booking System Design](/en/blog/how-to-reserve-srt-or-ktx/) - System design and architecture explanation
