# B2B-Promotion 프론트엔드앱 개발을 위한 지침

## 기술 스택 (반드시 준수, docs/3-prd.md 7절)

| 영역           | 선택                                                   |
| -------------- | ------------------------------------------------------ |
| 프론트엔드     | React 19                                               |
| 전역 상태관리  | Zustand (로그인 세션/사용자 정보 등 클라이언트 상태만) |
| 서버 통신/캐싱 | TanStack Query (API 호출, 서버 상태 캐싱/재검증)       |
| 백엔드         | Node.js + Express                                      |
| DB 드라이버    | pg (PostgreSQL 네이티브 드라이버)                      |
| 데이터베이스   | PostgreSQL 17                                          |

- 클라이언트 상태(로그인 여부, 사용자 정보 등)는 Zustand, 서버 데이터(프로모션 목록, 신청 목록 등)는 TanStack Query로 관리해 역할을 분리한다. Zustand에 서버 데이터를 복사해 넣지 않는다.
- 별도 UI 컴포넌트 라이브러리 도입은 필수 아님(PRD 6.1절) — 3일 일정상 커스텀 스타일 최소화를 권장하며, 새 의존성 추가 전 오버엔지니어링 여부를 먼저 판단한다.
- 접근성(a11y)·다국어(i18n)는 이 프로젝트 범위 밖이다(PRD 4.1절).

## 프론트엔드 개발 시 참조할 문서

- **도메인 정의서** [`1-domain-definition.md`](../docs/1-domain-definition.md) — 엔티티/필드, 비즈니스 규칙(BR-1~11), 유스케이스(UC-1~9), 예외케이스(EX-1~5)
- **PRD** [`3-prd.md`](../docs/3-prd.md) — 요구사항, 기술스택(React 19/Zustand/TanStack Query), 6.1절 반응형 UI 원칙
- **사용자 시나리오** [`4-user-scenario.md`](../docs/4-user-scenario.md) — 액터별 정상/예외 흐름
- **프로젝트 구조 설계 원칙** [`5-project-principle.md`](../docs/5-project-principle.md) — 레이어/코드/보안 원칙, 프론트엔드 디렉토리 구조(6절)
- **기술 아키텍처 다이어그램** [`6-arch-diagram.md`](../docs/6-arch-diagram.md) — FE 컴포넌트 구조, 인증 흐름
- **와이어프레임** [`7-wireframe.md`](../docs/7-wireframe.md) + [`wireframes/`](../docs/wireframes/) — 화면별 레이아웃 구조(ASCII), SVG 샘플
- **스타일 가이드** [`10-style.md`](../docs/10-style.md) — 컬러/타이포/여백/컴포넌트 패턴
- **실행 계획** [`9-plan.md`](../docs/9-plan.md) — FE Task 분해, 완료 조건 체크리스트
- **OpenAPI 스펙** [`swagger.json`](../docs/swagger.json) — 백엔드 엔드포인트 요청/응답 스키마 (개발 서버 구동 시 `/api-docs`에서도 조회 가능)
