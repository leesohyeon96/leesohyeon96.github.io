---
# preview details
layout: works-single # or Page 로 하면 됨
title: OhguOhguTalk Project
lang: ko
permalink: /ko/works/ohguohgutalk
category: 완료된 프로젝트
category_slug: completed-projects
image: assets/img/works/ohguohgutalk/ohguohgutalkThumb.png 
short_description: Websocket으로 구현한 간단한 웹 메시징 플랫폼

# full details
#live_preview: 
full_image: assets/img/works/ohguohgutalk/ohguohgutalkThumb.png
info:
  - label: 기간
    value: 2023.02 ~ 2023.08 (총 6개월)
  - label: About Technology
    value: Java17, SpringBoot 3.2, JPA, Redis, Websocket 라이브러리 1.1.2, Docker compose
  - label: About DataBase Tech
    value: mysql/Spring Data JPA, mongoDB/Spring Data MongoDB, Redis/Spring Data Redis 

description1:
  show: yes
  title: 주요 흐름
  text1: mysql, mongoDB, redis 를 docker hub에서 pull 받음 <br/> docker-compose.yml을 통해 3개의 이미지를 함께 컨테이너화함 <br/> 로컬환경에서만 실행하기 때문에 특별한 구조X <br/> 웹 화면에서 웹소켓을 통해 실시간채팅까지 구현함

description2:
  title: 아키텍처와 인프라
  description2_image:
    - assets/img/works/ohguohgutalk/ohguohgutalkarchitecture.png
    - assets/img/works/ohguohgutalk/ohguohgutalkInfra.png

description3:
  title: Github Gist
  text1: <a href="/sub/ohguohgutalkgist" target="_blank">Ohguohgutalk 구현기능 흐름 Github gist 확인하기</a>

#video: -> 비디오 필요하면 넣기
#  poster: assets/img/blog/blog9.jpg
#  id: Gu6z6kIukgg
---

