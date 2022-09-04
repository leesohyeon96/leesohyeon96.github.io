---
layout: page
title: Docker&AWS&Linux
---

# AWS  
</br>

## Servlet

- 요청과 간단한 메소드(doGet, doPost)로  요청을 처리 후 다시 client에게 응답해주는 (자바 프로그래밍) 기술 -> 자바 코드로 웹 서버를 만들어준건가?

- Servlet Container가 하는 일

  - 서블릿 생명주기[라이프 사이클] 관리
  - 웹서버와의 통신 지원 
    - Servlet과 Web Server가 손쉽게 통신할 수 있도록 해주어 소켓을 만들고 listen, accept 등을 API로 제공하여 복잡한 과정을 생략할 수 있게 해줌
  - 멀티쓰레드 지원 및 관리 
    - Servlet Container가 요청이 올 때마다 새로운 자바 Thread 하나 생성
    - Http 서비스 메소드 실행 후 Thread 자동 소멸
    - 원래는 Thread를 관리해야하지만 Server가 다중 쓰레드를 생성/운영 해주므로 쓰레드의 안정성에 대해서 걱정하지 않아도 됨
  - 선언적인 보안 관리
    - 서블릿 컨테이너가 보안 관련 내용을 대신 구현해주는 듯 
    - 일반적으로 보안 관리는 xml 배포 서술자에다 기록하기 때문에 보안에 대해 수정할 일이 있어도 자바 소스 코드를 수정할 필요가 없기 때문에 다시 컴파일 없이도 보안관리가 가능함

- **서블릿의 라이프 사이클**을 위한 [3가지 필수적인 메소드]

  - init()

    -> 서블릿 생명 주기 중 **초기화 단계**에 호출

    -> 이를 통해 Servlet이 Web Application에서 초기화 매개변수(parameter)에 접근할 수 있도록 함

  - service()

    -> 초기화(init) 이후 각각의 요청들이 들어오면 호출

    -> Web Container는 모든 요청에 대해 Servlet의 service() 메소드를 요청

    -> 각각의 요청들은 **별도로 나누어진 쓰레드**에서 처리됨

    -> 요청의 종류를 판별 후 요청을 처리할 적절한 메소드로 전달함[약간 dispatcherServlet같은 역할 느낌!]

  - destroy()

    -> Servlet 객체가 파괴되어야 할 때 호출됨

    -> 해당 Servlet이 가지고 있던 자원을 release 해줌

- Servlet 특징

  - Client의 요청에 **동적**으로 작동
  - Java Thread를 이용해 동작
  - HTML 변경 시 재컴파일 필요
  - Java코드에 HTML이 들어가있음 -> ?
  - HTML을 사용해서 요청에 응답 -> ?

- Servlet 동작과정에서 JVM의 역할
  - 각 요청들을 '분리된 Thread' 내부에서 처리함
  - 서블릿을 사용하는 것은 JVM이 각 요청을 **분리된 자바 스레드 내부에서 처리하도록**하는 것임 

=> 결론: 서블릿 컨테이너의 가장 중요한 기능은 **요청을 올바른 Servlet에 전달되서 처리**되도록 한 뒤 **JVM이 해당 요청을 처리**한 후에는 **생성된 결과를 올바른 장소에 동적으로 반환**해주는 것

- Servlet 생성 방법
  - @WebServlet 사용하여 해당 서블릿과 매핑될 url 지정
  - HttpServlet 클래스 상속

- Tomcat?

  -> WAS 중 하나이며 Servlet Container를 포함함 

- web.xml

  -> WAS는 Servlet을 생성하고 어떤 Servlet이 어떤 요청을 담당할 것인지 매핑함

  -> 이를 위해서는 WAS에게 Servlet에 대한 정보를 줘야하는 데 이때 쓰이는 파일이 **web.xml**임!

  -> servlet3.0부터는 web.xml 뿐만 아니라 자바 소스 설정(java config)로도 가능함[byat에서는 servlet3.1.0버전 사용!]
