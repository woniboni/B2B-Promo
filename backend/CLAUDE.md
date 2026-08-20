# B2B-Promotion 백엔드 개발을 위한 지침

## 반드시 준수할 사항

- SOLID 원칙을 반드시 지킬 것
- Clean 아키텍처를 반드시 구현할 것

## 백엔드 개발 시 참조할 문서

- **도메인 정의서** [`1-domain-definition.md`](../docs/1-domain-definition.md) — 엔티티/필드, 비즈니스 규칙(BR-1~11), 유스케이스(UC-1~9), 예외케이스(EX-1~5)
- **PRD** [`3-prd.md`](../docs/3-prd.md) — 요구사항, 기술스택, 일정, 리스크
- **프로젝트 구조 설계 원칙** [`5-project-principle.md`](../docs/5-project-principle.md) — 레이어/코드/테스트/보안 원칙, 백엔드 디렉토리 구조(7절)
- **기술 아키텍처 다이어그램** [`6-arch-diagram.md`](../docs/6-arch-diagram.md) — 시스템 구성도, 인증 흐름
- **ERD** [`8-erd.md`](../docs/8-erd.md)
- **DB 스키마(DDL)** [`8-schema.sql`](../docs/8-schema.sql) — PostgreSQL 17 DDL
- **실행 계획** [`9-plan.md`](../docs/9-plan.md) — BE Task 분해, 완료 조건 체크리스트
- **OpenAPI 스펙** [`swagger.json`](../docs/swagger.json) — 엔드포인트 요청/응답 스키마
