# 프로젝트 구조 설계 원칙 - B2B-Promo

## 변경 이력
| 버전 | 날짜/시간 | 변경 내용 |
|---|---|---|
| v1.0 | 2026-08-13 | 최초 작성 |
| v1.1 | 2026-08-13 | docs 정합성 교차 검토 결과 반영: PRD 참조 버전을 v1.4로 갱신 |
| v1.2 | 2026-08-13 | docs 정합성 교차 검토 결과 반영: 4-user-scenario.md 참조 버전을 v1.1로 갱신 |
| v1.3 | 2026-08-20 | 실제 백엔드 구현 현황 대비 정합성 점검 결과 반영: BE-1 진행 중 사용자가 4절의 "테스트 프레임워크 미도입" 원칙을 명시적으로 override하여 Jest+supertest 테스트 스위트를 도입했고(`docs/9-plan.md` v1.4 변경이력에 기록됨) BE-8까지 105개 이상의 테스트로 유지되고 있어, 4절에 이 override 사실과 현재 실제 테스트 방식(구동 중인 dev 서버에 대한 HTTP 통합 테스트, `jest --runInBand`)을 반영 |
| v1.4 | 2026-08-21 | 구현 완료 후 코드 대비 정합성 재검토 반영: 5절에 실제로는 Vercel(프론트+백엔드)/Supabase(DB)로 시연용 배포가 이루어졌음을 명시(CI/CD·모니터링은 여전히 범위 밖), 6절 디렉토리 구조에서 실제로 만들어지지 않은 `components/`를 "만들지 않는다" 목록으로 이동하고, 실제로 존재하는 `api/adminPromotions.js`(관리자 전용 API 분리)를 추가하며 `promotions.js` 설명을 실제 책임 범위(조회만)로 정정 |

> 본 문서는 `docs/1-domain-definition.md`(v1.5), `docs/2-usecase.md`, `docs/3-prd.md`(v1.5), `docs/4-user-scenario.md`(v1.1)를 기반으로 작성되었으며, UC/BR/EX 번호는 위 문서들과 동일하게 참조한다. 본 프로젝트는 3일 내 1인 개발로 핵심 기능(회원가입/로그인, 프로모션 CRUD, 참여신청, 쿠폰 추첨, 마이페이지)을 완성하는 교육용 실습이므로, 이 문서가 제시하는 구조는 "3일 안에 실제로 만들고 유지할 수 있는 최소 구조"를 원칙으로 한다.

---

## 1. 모든 스택에 공통인 최상위 원칙

- **오버엔지니어링 금지가 이 문서의 최우선 원칙이다** (`CLAUD.md` 최상위 지침, PRD 1절 "개발 배경"). 엔터프라이즈급 다계층 아키텍처(DDD, CQRS, 별도 도메인 서비스 레이어의 다중 분리 등)는 이 프로젝트의 규모(9개 유스케이스, 3일, 1인)에 맞지 않으므로 채택하지 않는다.
- **YAGNI**: 도메인 정의서의 UC-1~9에 실제로 필요한 코드만 작성한다. "나중에 필요할 것 같아서" 만드는 인터페이스, 추상 클래스, 설정값, 빈 폴더는 두지 않는다.
- **스택은 PRD 7절에 확정된 것을 그대로 따른다.** 프론트엔드는 React 19 + Zustand(전역 상태) + TanStack Query(서버 통신/캐싱), 백엔드는 Node.js + Express + pg(ORM 없이 직접 쿼리), DB는 PostgreSQL 17. 이 문서는 별도의 상태관리 라이브러리, ORM, 쿼리 빌더, 테스트 프레임워크, UI 컴포넌트 라이브러리 등 추가 의존성 도입을 제안하지 않는다.
- **평평하고 얕은 구조를 기본값으로 한다.** 폴더/레이어는 실제로 파일이 많아져 찾기 어려워졌을 때 나누며, 미리 나눠두지 않는다.
- **문서-코드 추적성**: 도메인 정의서의 UC/BR 번호를 코드 주석·커밋 메시지에 남겨, 특히 동시성(BR-6/7)·추첨(BR-4/5) 같은 까다로운 로직은 어떤 규칙을 구현한 코드인지 바로 찾을 수 있게 한다.
- **의도적 단순화는 `ponytail:` 주석으로 남긴다.** 한계와 "언제 확장할지" 기준을 한 줄로 명시한다(PRD 문서에서 이미 사용한 스타일과 동일).

## 2. 의존성/레이어 원칙

### 2.1 프론트엔드

```
컴포넌트(pages/components) → TanStack Query 훅(api/) → API 클라이언트 함수(fetch 래퍼) → 백엔드 REST API
```

- **Zustand는 클라이언트 전역 상태만 전담한다**: 로그인 세션(Access Token, 로그인한 사용자 정보) 이외의 것을 넣지 않는다.
- **서버 데이터(프로모션 목록, 내 신청 목록, 참여 현황 등)는 전부 TanStack Query 캐시가 유일한 원천(SSOT)이다.** Zustand에 서버 데이터를 복사해 넣거나 동기화하는 코드는 만들지 않는다.
- 의존 방향은 한쪽으로만 흐른다: `pages` → `components`(재사용 UI)는 허용하지만 `components`가 `pages`를 import하는 것은 금지. `pages/components`는 `api/`(TanStack Query 훅)에 의존할 수 있지만 `api/`는 컴포넌트를 알지 못한다.
- API 요청 헤더에 Access Token을 붙이고, 401 발생 시 `/auth/refresh`를 호출해 재시도하는 로직은 fetch 래퍼 한 곳에만 둔다. 각 화면/훅에서 개별적으로 재구현하지 않는다.

### 2.2 백엔드

```
라우트(routes) → 컨트롤러(controllers) → DB 쿼리 계층(db/) → PostgreSQL(pg pool)
```

- **라우트**: URL과 미들웨어(인증 등) 연결만 담당하며 비즈니스 로직을 두지 않는다.
- **컨트롤러**: 요청 검증 + 비즈니스 로직 + 응답 포맷을 담당한다. pg pool에 직접 접근하지 않고 항상 `db/` 계층의 쿼리 함수를 호출한다.
- **여러 테이블에 걸친 로직은 반드시 하나의 pg 트랜잭션(BEGIN/COMMIT/ROLLBACK) 안에서 처리한다.** 특히 참여신청 성공 시 `CouponEvent.applied_count` 원자적 증가 + 마감 판정(BR-6, BR-7) + `DrawResult` 확정(BR-4, BR-5)은 한 트랜잭션으로 묶어 PRD 6.2절의 조건부 원자 증가 쿼리(`UPDATE ... WHERE applied_count < capacity RETURNING ...`) 방식을 그대로 따른다.
- **DB 쿼리 계층은 SQL 문자열과 파라미터 바인딩만 다루고 Express의 `req`/`res`를 알지 못한다.** 컨트롤러가 쿼리 계층을 호출하는 것은 되지만 역방향은 금지.
- **별도 서비스 레이어, Repository 패턴 클래스는 두지 않는다.** 컨트롤러가 곧 비즈니스 로직 계층을 겸한다.
  - ponytail: 유스케이스가 9개뿐이라 컨트롤러-쿼리 2계층으로 충분하다. 유스케이스가 크게 늘어나(예: 30개 이상) 컨트롤러 파일이 감당하기 어려워지면 그때 서비스 레이어 분리를 검토한다.
- 전역 미들웨어는 **인증(JWT 검증)** 과 **에러 핸들러** 두 가지만 둔다. 로깅/rate limit 등 추가 미들웨어는 이번 범위 밖(PRD 4.1절 제외 항목과 동일 맥락).

## 3. 코드/네이밍 원칙

- 백엔드 라우트/컨트롤러/쿼리 파일은 도메인 정의서 엔티티(또는 엔티티 묶음) 단위로 1개씩만 둔다: 예) `promotions.routes.js` / `promotions.controller.js` / `promotions.queries.js`. 같은 엔티티를 인위적으로 더 잘게 쪼개지 않는다.
- DB 테이블/컬럼명은 도메인 정의서 2-1절 필드명을 스네이크케이스로 그대로 사용한다(`applied_count`, `discount_rate`, `confirmed_at` 등). ORM 매핑 레이어가 없으므로 쿼리 결과 필드명을 그대로 응답에 사용해도 무방하다.
- 프론트 TanStack Query 훅은 `use + 도메인명` 패턴으로 유스케이스 단위 명명한다: `usePromotions`(UC-2), `usePromotionDetail`(UC-2), `useApplyPromotion`(UC-3/4), `useMyApplications`(UC-5).
- 코드 상의 엔티티/변수명은 도메인 정의서 용어(Promotion, Application, CouponEvent, DrawResult, Partner)를 영문 그대로 사용해 문서-코드 간 번역 비용을 없앤다.
- `status` 값은 영문 코드(`draft`/`published`/`closed`, `applied`/`canceled`)로 통일하고, 주석에 도메인 정의서상의 한글 표현(임시저장/게시됨/종료됨, 신청됨/취소됨)을 병기한다. 프로젝트 전체에서 한/영 표기를 섞어 쓰지 않는다.

## 4. 테스트/품질 원칙

> **[v1.3 override 반영]** 아래 원문 원칙(자동화 테스트 최소화, Jest 미도입)은 최초 계획이었으나, BE-1 진행 중 사용자가 이를 명시적으로 override하여 Jest+supertest 자동화 테스트 스위트를 도입했다(`docs/9-plan.md` v1.4 변경이력). BE-2~BE-8 전 구간에서 각 태스크마다 90%+ 커버리지 목표로 테스트를 작성했고, 이후 방침 변경으로 in-process 실행 대신 **미리 구동해둔 dev 서버(`npm run dev`)에 실제 HTTP 요청을 보내는 통합 테스트** 방식으로 전환했다(`docs/9-plan.md` v1.7). 여러 테스트 파일이 동시에 하나의 서버를 두들겨 발생한 타임아웃 문제로 `package.json`의 `test` 스크립트도 `jest --runInBand`(직렬 실행)로 변경되었다(`docs/9-plan.md` v1.12). 아래 원문은 최초 계획 기록으로 남겨두되, **실제로는 따르고 있지 않다.**
>
> 유일하게 원문 그대로 유지된 것은 QA-1(`verifyConcurrency.js`)/QA-2(`verifyDrawDistribution.js`) 스크립트 방식이며, 이 둘은 아직 수행되지 않았다(`docs/9-plan.md` QA 절 미체크).

- PRD 9절 방침대로 **자동화 테스트 커버리지는 최소화하고 수동 QA를 기본으로 한다.** Jest 등 테스트 프레임워크, 단위/통합/컨트랙트 테스트 스위트를 전면 도입하지 않는다. ~~(위 override 참고: 실제로는 Jest+supertest를 전면 도입해 사용 중)~~
- 단, "눈으로 결과를 확인하기 어려운" 핵심 비즈니스 규칙 3가지만 PRD 6.2절과 동일한 방식으로 재현 스크립트를 만들어 검증한다(테스트 프레임워크 없이 `node script.js` 실행 파일 형태로 충분):
  - **BR-6/BR-7 (선착순 50명 동시성)**: 동일 프로모션에 대해 다수(예: 100개)의 참여신청 요청을 `Promise.all`로 동시에 발사하고, 성공 건수가 정확히 50건인지, `applied_count`가 50에서 멈추는지 확인하는 스크립트 하나(`backend/scripts/verifyConcurrency.js`).
  - **BR-4 (추첨 확률분포)**: 추첨 함수를 200회 이상 반복 호출해 할인율별 당첨 비율을 집계하고, 목표 확률(40/30/20/10%) 대비 ±10%p 이내인지 콘솔로 확인하는 스크립트(`backend/scripts/verifyDrawDistribution.js`).
  - **BR-3/BR-5 (상태 전환·재추첨 금지)**: 신청→취소→재신청 흐름에서 `Application.status`가 올바르게 전환되고 `DrawResult`가 upsert되는지는 자동 스크립트보다 **수동 QA 체크리스트**로 확인한다(EX-2/EX-4 포함).
- 그 외 예외 케이스(EX-1~5) 전체도 자동 테스트 대신 Day 3의 수동 QA 체크리스트로 순회 확인한다.
- 위에서 언급한 2개 스크립트 + 수동 QA 체크리스트 외의 별도 테스트 코드는 이번 프로젝트 범위 밖이다.
  - ponytail: 자동화 테스트가 거의 없는 상태다. 3일·1인 규모에서는 수동 QA가 더 빠르고 확실하다. 실서비스로 전환되거나 개발 인원이 늘어나면 그때 Jest 등 테스트 프레임워크 도입을 검토한다.

## 5. 설정/보안/운영 원칙

- DB 접속정보, JWT 시크릿 등은 `.env`로 분리하고 저장소에 커밋하지 않는다.
- 비밀번호는 bcrypt로 해시하여 저장한다(PRD 6.3절, 평문 저장 금지).
- 인증은 PRD 6.3절 그대로 JWT Access(짧은 만료) + Refresh(긴 만료) 이중 토큰 방식을 따르며, 두 토큰 모두 클라이언트 측(Zustand 전역 상태, localStorage에 영속화)에 저장한다. `/auth/refresh` 재발급 엔드포인트 하나로 재발급 로직을 일원화한다. Refresh Token은 stateless 검증이며 별도 DB 저장/블랙리스트는 두지 않는다.
  - ponytail: 두 토큰 모두 JS로 접근 가능한 저장소에 있어 httpOnly 쿠키 방식보다 XSS 탈취 위험이 크다. 교육용 MVP 범위에서 감수하는 단순화이며, 실서비스 전환 시 Refresh Token을 httpOnly 쿠키로 승격한다.
  - ponytail: 탈취된 Refresh Token의 즉시 무효화(revocation)는 지원하지 않는다. 필요해지면 Refresh Token을 DB에 저장하고 로그아웃/재발급 시 폐기(rotation)하는 방식으로 승격한다.
- 인증 미들웨어 하나로 모든 보호 라우트를 감싼다(BR-1). 라우트마다 인증 로직을 개별 구현하지 않는다.
- 관리자 권한 체크는 `User.role` 값을 확인하는 간단한 조건문/미들웨어 하나로 충분하다. 역할이 2개(거래처 담당자/관리자)뿐이므로 별도 RBAC 프레임워크나 권한 테이블은 도입하지 않는다.
- SQL Injection 방지는 `pg`의 파라미터 바인딩(`$1, $2...`)을 예외 없이 사용하는 것만으로 충분하다. 별도 검증 라이브러리 도입 없이, 요청 바디의 필수 필드 존재 여부 정도만 컨트롤러 진입부에서 확인한다.
- CORS는 프론트엔드 개발/데모 서버 origin만 허용하는 최소 설정으로 둔다.
- CI/CD 파이프라인, 로드밸런싱, 모니터링 대시보드 등은 PRD 4.1절에서 명시적으로 범위 밖이다. 로깅은 `console.error` 수준으로 충분하며 별도 구조화 로깅 시스템은 두지 않는다.
  - 다만 시연을 위해 프론트엔드(Vercel Static/Vite)와 백엔드(Vercel 서버리스 Express)를 Vercel에 배포하고 Supabase PostgreSQL을 운영 DB로 연결했다(각각 `frontend/vercel.json`, 백엔드는 `backend/.env.production` 기준). 빌드 파이프라인 자동화나 모니터링은 여전히 구성하지 않았다 — 이 항목이 가리키는 "인프라"는 CI/CD·로드밸런싱·모니터링이지, 배포 자체를 막는 것은 아니다.
  - ponytail: 구조화 로깅, 헬스체크 이상의 모니터링, CI/CD 파이프라인이 없다. 실제 운영으로 전환할 때 이 세 가지부터 갖춘다.
- Rate limiting, API 키 관리, 감사 로그 등은 교육용 MVP로서 실사용자 트래픽이 없으므로 이번 범위에서 제외한다.

## 6. 디렉토리 구조 — 프론트엔드

```
frontend/
  src/
    pages/                        # 화면 단위 (유스케이스 대응)
      LoginPage.jsx                # UC-1
      SignupPage.jsx                # UC-1
      PromotionListPage.jsx         # UC-2
      PromotionDetailPage.jsx       # UC-2, UC-3, UC-4
      MyApplicationsPage.jsx        # UC-5
      MyPage.jsx                    # UC-9 (Could)
      admin/
        AdminPromotionListPage.jsx    # UC-7, UC-8
        AdminPromotionFormPage.jsx    # UC-6, UC-7
        AdminPromotionStatusPage.jsx  # UC-8
    api/                           # 백엔드 호출 함수 + TanStack Query 훅 (엔티티 단위)
      client.js                     # fetch 래퍼: Access Token 부착, 401→refresh 재시도 공통 처리
      auth.js                       # login/signup/refresh
      promotions.js                 # 거래처용 목록/상세 조회
      adminPromotions.js            # 관리자 전용: 등록/수정/게시·종료/참여현황 (엔드포인트 4개, promotions.js와 책임 분리)
      applications.js               # 신청/취소/내 목록
      users.js                      # 마이페이지
    store/                         # Zustand: 클라이언트 전역 상태만
      authStore.js                  # 로그인 세션(Access Token, 로그인 사용자 정보)
    App.jsx
    main.jsx
```

- `components/`(여러 페이지가 공유하는 순수 UI 조각), `layouts/`, `hooks/`(공용 커스텀 훅), `utils/` 등은 만들지 않는다. 실제로 중복이 발생해 필요해지는 시점에 추가한다(구현 완료 시점까지 `components/`가 필요해진 적이 없었다).
- 라우팅은 하나의 라이브러리(예: react-router)를 선택해 `App.jsx`에서 일괄 정의한다. 파일 기반 라우팅 프레임워크나 별도 라우트 설정 파일은 불필요하다.

## 7. 디렉토리 구조 — 백엔드

```
backend/
  src/
    routes/                       # 엔티티 단위, URL-컨트롤러 연결만
      auth.routes.js
      promotions.routes.js
      applications.routes.js
      users.routes.js
    controllers/                  # 요청 검증 + 비즈니스 로직 + 응답 (서비스 레이어 겸함)
      auth.controller.js
      promotions.controller.js
      applications.controller.js   # UC-3/UC-4: 신청+추첨 원자적 트랜잭션 포함 (BR-4~7)
      users.controller.js
    db/                            # 쿼리 계층 (SQL + 파라미터 바인딩만, req/res 모름)
      pool.js                       # pg Pool 설정
      users.queries.js
      promotions.queries.js
      couponEvents.queries.js
      applications.queries.js
      drawResults.queries.js
    middlewares/
      auth.js                       # JWT 검증 (BR-1)
      errorHandler.js
    app.js
    server.js
  migrations/
    001_init.sql                   # 도메인 정의서 2-1절 엔티티를 그대로 테이블로 매핑
  scripts/                         # 테스트/검증용 1회성 스크립트 (4절 참조)
    seedAdmin.js                    # 관리자 계정 시딩 (BR-2)
    verifyConcurrency.js            # BR-6/BR-7 동시성 재현 검증
    verifyDrawDistribution.js       # BR-4 확률분포 검증
  .env
```

- 별도 `services/` 디렉토리는 만들지 않는다. 컨트롤러가 비즈니스 로직 계층을 겸한다(2.2절 참고).
- 트랜잭션이 필요한 로직(BR-4~7)은 컨트롤러 안에서 `pool.connect()` 후 `BEGIN`/`COMMIT`/`ROLLBACK`을 직접 다루거나, 필요하면 `db/withTransaction.js` 같은 얇은 헬퍼 함수 하나만 추가한다. 그 이상의 트랜잭션 매니저 계층은 두지 않는다.
- 미들웨어는 `auth.js`, `errorHandler.js` 두 개로 충분하다(5절 참고).
