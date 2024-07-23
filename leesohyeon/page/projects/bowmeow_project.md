---
layout: page
title: BowMeow Project
---
***

- **프로젝트 이름 : BowMeow**

- **프로젝트 진행기간 : 2024.07.01 ~ 진행중**

- **진행인원 : 2명**

- **프로젝트 소개 : 애완동물용품 전용 중고거래 어플리케이션 (소비자-소비자 or 업자-소비자 or 업자-업자 거래형식이 가능)**

<br/>

# 구조
<img src="{{ site.baseurl }}/img/bowMeowArchitecture.png" alt="">
: MSA 구조
<br/>

# 인프라
<img src="{{ site.baseurl }}/img/bowMeowInstanceArchitecture.png" alt="">
: 각 Service project를 dockerfile 설정을 통해 이미지화 함
: docker-compose.yml 은 따로 중앙 디렉토리에 작성하여 ec2 인스턴스로 전송함
: ec2 인스턴스에서 이미지들을 pull 받은 뒤 전송받은 docker-compose.yml을 사용해 해당 서비스들을 컨테이너화 시킴

<br/>

***

<br/>

# Sub Project
***

## API Gateway Project
: [github에서 확인하기](https://github.com/seoyeome/bowmeow-gateway/tree/develop)

## Payment Project
: [github에서 확인하기](https://github.com/leesohyeon96/payment/tree/develop)

## Member Project
: 작성 예정
