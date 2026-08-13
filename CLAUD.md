# B2B-Promo 프로젝트의 최상위 지침

## 반드시 준수할 최우선 지침

- 모든 대화는 한국어로 할 것
- 오버엔지니어링 금지

## 개발할 때 다음 사항을 준수할 것

- 안드레 카파시의 CLAUD.md
- https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/refs/heads/main/CLAUDE.md

## docs 디렉토리 문서 참조

작업 전 관련 문서를 먼저 확인할 것. 각 문서는 상단에 "변경 이력" 표가 있으니 인용 시 최신 버전 번호를 확인하고, 문서 간 상호 참조 버전도 항상 최신으로 동기화할 것.

| 파일 | 내용 | 최신 버전 |
|---|---|---|
| `docs/1-domain-definition.md` | 도메인 정의서 — 액터, 엔티티/필드, 비즈니스 규칙(BR-1~11), 유스케이스(UC-1~9), 예외케이스(EX-1~5), MVP 범위, 알려진 제약. 모든 문서의 근간이 되는 단일 진실 소스 | v1.5 |
| `docs/2-usecase.md` | 유스케이스 다이어그램 (mermaid flowchart) | v1.2 |
| `docs/3-prd.md` | PRD — 목표/KPI, 범위, 기능·비기능 요구사항, 기술스택, 3일/1인 일정, 리스크 | v1.5 |
| `docs/4-user-scenario.md` | 액터별 사용자 시나리오 (정상/예외 흐름) | v1.1 |
| `docs/5-project-principle.md` | 프로젝트 구조 설계 원칙 — 레이어/코드/테스트/보안 원칙, FE·BE 디렉토리 구조 | v1.2 |
| `docs/6-arch-diagram.md` | 기술 아키텍처 다이어그램(mermaid) — 시스템 구성도, FE 컴포넌트 구조, 인증 흐름 | v1.1 |
| `docs/7-wireframe.md` + `docs/wireframes/` | 화면별 와이어프레임(ASCII), SVG 샘플 1건 | v1.3 |
| `docs/8-erd.md` | ERD (mermaid erDiagram) | v1.1 |
| `docs/8-schema.sql` | 실제 PostgreSQL 17 DDL (ERD 기반) | v1.1 |
| `docs/9-plan.md` | 실행 계획 — DB/BE/FE/QA Task 분해, 선행 Task, 체크박스 완료 조건 | v1.3 |
| `docs/swagger.json` | OpenAPI 3.0 스펙 | 1.0.1 |

문서 간 의존 순서: `1-domain-definition.md`(근간) → `2-usecase.md`/`3-prd.md`/`4-user-scenario.md`/`7-wireframe.md`(요구사항·UX) → `5-project-principle.md`/`6-arch-diagram.md`/`8-erd.md`/`8-schema.sql`/`swagger.json`(기술 설계) → `9-plan.md`(실행 계획, 진행 상황은 체크박스로 추적).
