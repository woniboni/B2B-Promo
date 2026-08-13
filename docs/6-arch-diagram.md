# 기술 아키텍처 다이어그램 - B2B-Promo

## 변경 이력
| 버전 | 날짜/시간 | 변경 내용 |
|---|---|---|
| v1.0 | 2026-08-13 | 최초 작성 |
| v1.1 | 2026-08-13 | 프론트엔드 컴포넌트 구조 다이어그램 추가 |

> 본 문서는 `docs/1-domain-definition.md`(v1.5), `docs/3-prd.md`(v1.4), `docs/5-project-principle.md`(v1.0)를 기반으로 작성되었다. PRD v1.4에 따라 Access/Refresh 토큰은 모두 클라이언트 측(Zustand/localStorage)에 저장하며 httpOnly 쿠키는 사용하지 않는다. 로드밸런서·캐시서버·메시지큐·CDN·모니터링 등 이번 MVP 범위에 없는 인프라는 다이어그램에 포함하지 않는다.

---

## 1. 전체 시스템 구성도

```mermaid
flowchart LR
  subgraph browser["브라우저 (React 19 SPA)"]
    direction TB
    pages["pages / components"]
    store["Zustand<br/>(로그인 세션 상태)"]
    query["api/*.js<br/>(TanStack Query 훅)"]
    client["api/client.js<br/>(fetch 래퍼: Bearer 헤더 부착, 401→refresh)"]

    pages --> query
    pages -.읽기.-> store
    query --> client
    client -.토큰 읽기/갱신.-> store
  end

  subgraph server["Express API 서버"]
    direction TB
    routes["routes/"]
    controllers["controllers/"]
    db["db/ (쿼리 계층, pg)"]

    routes --> controllers --> db
  end

  pg[("PostgreSQL 17")]

  client -- "HTTP REST (JSON)" --> routes
  db -- "SQL (파라미터 바인딩)" --> pg
```

- 프론트: 화면(pages/components)은 서버 데이터를 TanStack Query 훅으로만 가져오고, Zustand는 로그인 세션(토큰·사용자 정보)만 별도로 관리한다(`5-project-principle.md` 2.1절).
- 백엔드: routes → controllers → db(쿼리 계층) 3단 구조로만 흐르며, 컨트롤러가 비즈니스 로직 계층을 겸한다(서비스 레이어 없음).
- ORM 없이 `db/`에서 `pg`로 파라미터화된 SQL을 PostgreSQL에 직접 실행한다.

---

## 2. 프론트엔드 컴포넌트 구조

```mermaid
flowchart TB
  app["App.jsx (라우팅)"]

  subgraph pages["pages/"]
    direction TB
    login["LoginPage (UC-1)"]
    signup["SignupPage (UC-1)"]
    list["PromotionListPage (UC-2)"]
    detail["PromotionDetailPage (UC-2/3/4)"]
    myapp["MyApplicationsPage (UC-5)"]
    mypage["MyPage (UC-9)"]
    adminList["admin/AdminPromotionListPage (UC-7/8)"]
    adminForm["admin/AdminPromotionFormPage (UC-6/7)"]
    adminStatus["admin/AdminPromotionStatusPage (UC-8)"]
  end

  components["components/ (공용 UI)"]
  api["api/*.js (TanStack Query 훅)"]
  store["store/authStore.js (Zustand)"]

  app --> login & signup & list & detail & myapp & mypage & adminList & adminForm & adminStatus

  pages --> components
  pages --> api
  pages -.로그인 세션 참조.-> store
```

- `App.jsx`가 라우팅으로 각 page를 연결하고, page들은 공용 `components/`를 재사용한다(`5-project-principle.md` 6절과 동일 구조).
- 서버 데이터(프로모션/신청 목록 등)는 모든 page가 `api/*.js`(TanStack Query 훅)로만 가져온다.
- `store/authStore.js`(Zustand)는 로그인 세션만 참조하며 서버 데이터는 담지 않는다.

---

## 3. 인증 흐름

```mermaid
sequenceDiagram
  participant U as 사용자
  participant B as 브라우저 (Zustand/localStorage)
  participant S as Express API

  U->>B: 이메일/비밀번호 입력 후 로그인
  B->>S: POST /auth/login
  S-->>B: Access Token + Refresh Token 발급
  B->>B: 두 토큰을 Zustand·localStorage에 저장

  B->>S: API 요청 (Authorization: Bearer AccessToken)
  S-->>B: 정상 응답

  B->>S: API 요청 (Access Token 만료)
  S-->>B: 401 Unauthorized
  B->>S: POST /auth/refresh (저장된 Refresh Token 전송)
  S-->>B: 새 Access Token 발급
  B->>S: 원래 API 요청 재시도
  S-->>B: 정상 응답
```

- Access/Refresh 토큰 모두 클라이언트(Zustand + localStorage 영속화)에 저장하며 httpOnly 쿠키는 사용하지 않는다(PRD v1.4).
- Access Token 만료(401) 시에만 `/auth/refresh`를 호출해 Refresh Token으로 재발급받고, 원 요청을 재시도한다.
- Refresh Token은 서명 검증만 하는 stateless 방식이라 서버에 별도 저장소가 없다.
  - ponytail: 두 토큰이 모두 JS 접근 가능한 저장소에 있어 XSS 시 탈취 위험이 크다. 교육용 MVP 범위에서 감수하며, 실서비스 전환 시 Refresh Token을 httpOnly 쿠키로 승격한다(PRD 6.3절과 동일).
