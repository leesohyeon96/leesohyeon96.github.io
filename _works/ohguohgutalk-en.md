---
# preview details
layout: works-single # or Page 로 하면 됨
title: OhguOhguTalk Project
lang: en
permalink: /en/works/ohguohgutalk
category: Completed Projects
category_slug: completed-projects
image: assets/img/works/ohguohgutalk/ohguohgutalkThumb.png 
short_description: Simple web messaging platform implemented with WebSocket

# full details
#live_preview: 
full_image: assets/img/works/ohguohgutalk/ohguohgutalkThumb.png
info:
  - label: Period
    value: 2023.02 ~ 2023.08 (6 months total)
  - label: About Technology
    value: Java17, SpringBoot 3.2, JPA, Redis, WebSocket library 1.1.2, Docker compose
  - label: About DataBase Tech
    value: mysql/Spring Data JPA, mongoDB/Spring Data MongoDB, Redis/Spring Data Redis 

description1:
  show: yes
  title: Main Flow
  text1: Pull mysql, mongoDB, redis from docker hub <br/> Containerize 3 images together through docker-compose.yml <br/> No special structure since it only runs in local environment <br/> Implemented real-time chat through WebSocket on web interface

description2:
  title: Architecture and Infrastructure
  description2_image:
    - assets/img/works/ohguohgutalk/ohguohgutalkarchitecture.png
    - assets/img/works/ohguohgutalk/ohguohgutalkInfra.png

description3:
  title: Github Gist
  text1: <a href="/sub/ohguohgutalkgist" target="_blank">Check Ohguohgutalk implementation flow Github gist</a>

#video: -> 비디오 필요하면 넣기
#  poster: assets/img/blog/blog9.jpg
#  id: Gu6z6kIukgg
--- 