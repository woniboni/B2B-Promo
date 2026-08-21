# B2B-Promo

식자재 유통사가 거래처(외식업체·급식업체 등)에 프로모션을 게시하고, 거래처 담당자가 조회·참여 신청하는 B2B 프로모션 플랫폼입니다.

## 문서

| 문서 | 설명 |
|---|---|
| [1-domain-definition.md](docs/1-domain-definition.md) | 도메인 정의서 (엔티티/필드, 비즈니스 규칙, 유스케이스, 예외케이스) |
| [2-usecase.md](docs/2-usecase.md) | 유스케이스 다이어그램 |
| [3-prd.md](docs/3-prd.md) | PRD (제품 요구사항 문서) |
| [4-user-scenario.md](docs/4-user-scenario.md) | 사용자 시나리오 |
| [5-project-principle.md](docs/5-project-principle.md) | 프로젝트 구조 설계 원칙 |
| [6-arch-diagram.md](docs/6-arch-diagram.md) | 기술 아키텍처 다이어그램 |
| [7-wireframe.md](docs/7-wireframe.md) | 와이어프레임 |
| [8-erd.md](docs/8-erd.md) | ERD |
| [8-schema.sql](docs/8-schema.sql) | DB 스키마 (PostgreSQL DDL) |
| [9-plan.md](docs/9-plan.md) | 실행 계획 (Task 분해, 완료 조건 체크리스트) |
| [10-style.md](docs/10-style.md) | 스타일 가이드 |
| [swagger.json](docs/swagger.json) | OpenAPI 스펙 |

## Demo Site

https://woniboni-0629-fe.vercel.app/

(백엔드: https://woniboni-0629-be.vercel.app/)

## 테스트용 계정

| 구분 | 이메일 | 비밀번호 |
|---|---|---|
| 관리자 | `admin@b2b-promo.local` | `changeme123` |
| 거래처 담당자 | `gdhong@example.com` | `asdf1234` |

## 테스트 시나리오

**거래처 담당자 (`gdhong@example.com`)**
1. 로그인 후 "진행 중인 프로모션" 목록에서 게시된 프로모션을 확인한다.
2. 프로모션 상세로 진입해 "참여 신청하기"를 누른다. 쿠폰 이벤트가 붙은 프로모션이면 즉시 추첨 결과(당첨 할인율·유효기한) 모달이 뜬다.
3. 같은 프로모션에 다시 신청하면 "이미 신청한 프로모션입니다" 안내가 뜨는지 확인한다(중복 신청 거부).
4. "내 신청 목록"에서 방금 신청한 건을 "취소하기" → 상태가 취소됨으로 바뀌고 "재신청하기" 버튼이 나타나는지 확인한다. 재신청 시 같은 카드가 유지되며(새 카드 생성 안 됨) 새로 추첨된 할인율로 갱신된다.
5. "마이페이지"에서 이름·전화번호를 수정하고 저장이 반영되는지 확인한다.

**관리자 (`admin@b2b-promo.local`)**
1. 로그인 후 관리자 화면에서 "+ 새 프로모션 등록"으로 프로모션을 등록한다(쿠폰 이벤트 부착 시 정원 50명 고정).
2. "임시저장"으로 저장하면 거래처 목록에는 노출되지 않고, "게시"로 전환하면 즉시 거래처 목록에 노출되는지 확인한다.
3. 프로모션의 "현황" 링크에서 신청됨/취소됨 건수와 할인율별 당첨 분포를 확인한다.
4. 프로모션을 "종료" 처리하면 거래처 목록에서 즉시 사라지지만, 이미 신청한 거래처는 신청 이력을 계속 조회·취소할 수 있는지 확인한다.
5. 거래처 담당자 계정으로 관리자 URL(`/admin`)에 직접 접근하면 차단되는지 확인한다.

더 상세한 시나리오와 예외 케이스(EX-1~EX-5) 검증 결과는 [e2e/report.md](e2e/report.md)(로컬)와 [e2e/production/report.md](e2e/production/report.md)(배포 환경)에 기록되어 있다.
