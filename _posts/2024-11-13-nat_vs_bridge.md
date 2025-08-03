---
layout: post
title: "NAT vs Bridge"
date: 2024-11-13
category: 개념
image: assets/img/blog/default.png
author: 이소현
lang: ko
permalink: /ko/blog/nat_vs_bridge/
---


# 가상 서버 구성 및 NAT vs Bridge 정리

<br/>

---

<br/>


## 🧩 배경
회사에서 가상서버 구현하시는 거 구경하다가 알게된 사실 정리하는 글<br/>
제공된 운영체제는 **Windows OS**였다

<br/>

---

<br/>

## ⚙️ 과정
Windows에서 가상화 소프트웨어(VMware)를 이용해 총 **3개의 가상머신(VM)** 을 생성함:
- Application 서버
- DB 서버
- 기타 서버 (무슨 목적이였는지 기억이 잘안남)

VM을 만들 때 네트워크 설정을 해야 하는데, **주로 두 가지 방식인 NAT와 Bridge** 중에서 선택하게 됨  
이 두 방식은 가상머신이 외부 또는 내부 네트워크와 통신하는 방식에 큰 차이가 있음

<br/>

---

<br/>

## 🌐 NAT vs Bridge – 차이점 정리

| 구분 | NAT(Network Address Translation) | Bridge(브리지 네트워크) |
|------|----------------------------------|--------------------------|
| IP 부여 방식 | **호스트 OS** 가 DHCP 서버 역할을 하며 **내부 IP** 부여 | 실제 물리 네트워크(DHCP 서버 or 공유기)에서 **직접 IP 할당** |
| 외부 통신 | VM이 외부와 통신할 수 있지만, 외부에서 **직접 접근 불가** | 외부에서도 VM에 **직접 접근 가능** |
| 구조 | 외부 → **Host OS** → VM (호스트를 경유) | 외부 → **VM 직접 접근** |
| 보안 | 상대적으로 **안전함** (내부망 느낌) | 외부에 노출될 수 있어 **보안 설정 필요** |
| 용도 | 개발/테스트 환경에 적합 | 실제 서비스 환경, 여러 장비 간 통신 필요한 경우 |
| 관련 개념 | **Jump Host** 구조와 유사 <br> (ex. `ProxyCommand`를 사용한 SSH 연결) | **일반 서버처럼 독립 IP 사용** |

##### ProxyCommand란?
- SSH가 최종 목적지 서버에 접속하기 전에 `중간 서버를 통해 터널을 연결하는 명령어를 정의`하는 옵션임
- [내 컴퓨터] -- SSH --> [Jump Host] -- SSH --> [목적지 서버]
```
ssh -o "ProxyCommand ssh user@jump.example.com nc private.server.local 22" user@private.server.local
```
1) jump.example.com 서버에서 SSH로 접근함
2) 중간의 nc 명령어를 통해 private.sever.local:22 에 연결
3) 터널을 통해 최종 서버에 SSH 접속 완료


<br/>

---

<br/>

## 💡 추가 설명 (비유)

**NAT**  
  → 마치 집에서 **공유기(Wi-Fi)** 를 사용하는 것과 같음
  VM은 **사설 IP**(예: 192.168.x.x)를 가지고 있고, 외부와 통신할 때는 **호스트를 통해 나감**  
  외부에서 직접 이 VM으로 들어올 수 없음

**Bridge**  
  → VM도 마치 **직접 랜선 꽂은 일반 PC**처럼 동작
  공유기에서 직접 공인 IP 또는 사설 IP를 받아서, 같은 네트워크 내에 있는 다른 장치들과 **동등하게 통신 가능**

<br/>

---

<br/>

## ✅ 정리

> **NAT** 방식은 개발자 혼자 테스트할 때 적합하고,  
> **Bridge** 방식은 실제 서버처럼 구성할 때 유용함
> 보안, 접근성, 네트워크 정책에 따라 적절한 방식을 선택하는 것이 중요함
