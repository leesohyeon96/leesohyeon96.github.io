---
layout: page
title: Ohguohgutalk Project
---
***

- **프로젝트 이름 : Ohguohgutalk**

- **프로젝트 진행기간 : 2023.02 ~ 2023.08**

- **진행인원 : 1명**

- **프로젝트 소개 : webSocket으로 구현한 간단한 웹 메시징 플랫폼**

<br/>

# 설정
- Java 17
- SpringBoot 3.2
- docker-compose
- webSocket 라이브러리 1.1.2
- mysql + spring data JPA
- mongoDB + spring data mongoDB
- redis + spring data Redis

<br/>

# 구조
: <img src="{{ site.baseurl }}/img/ohguhogutalkarchitecture.png">
: mysql, mongoDB, redis -> docker에서 pull 받아 컨테이너로 돌림
- 로컬환경에서만 실행하기 때문에 특별한 구조X
- docker-compose 로 pull 받은 이미지를 1번에 container화 하도록 함

<br/>

# 인프라
: <img src="{{ site.baseurl }}/img/ohguohgutalkInfra.png">


<br/>

***

<br/>

# Github
[github 확인하기](https://github.com/leesohyeon96/real-ohguohgutalk)

<br/>

**[ GitHub Gist ]**  
- [회원가입 및 로그인 기능 흐름 Github Gist 보기](ohguohgutalkgithubgistmember.md)
- [채팅 기능 흐름 Github Gist 보기](ohguohgutalkgithubgistchat.md)

<br/>


***


[프로젝트 목록으로 되돌아가기](https://leesohyeon96.github.io/projects/)
