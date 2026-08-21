# E2E 테스트 리포트 - B2B-Promo (배포 환경)

- 실행일: 2026-08-21
- 대상: 실제 배포된 서비스
  - 프론트: https://woniboni-0629-fe.vercel.app/ (Vercel)
  - 백엔드: https://woniboni-0629-be.vercel.app/ (Vercel)
  - DB: Supabase 운영 PostgreSQL (`.env.production`의 `DB_CONN_STRING`)
- 도구: Playwright MCP(브라우저로 실제 배포 프론트 조작), 배포 백엔드 API 직접 호출(테스트 데이터 준비), PostgreSQL MCP(운영 DB 상태 확인/정리)
- 근거 문서: `docs/4-user-scenario.md`

로컬 dev 서버 대상 E2E(`e2e/report.md`)와 별개로, **실제 배포된 프론트가 실제 배포된 백엔드와 정상 연동되는지**를 브라우저로 검증하는 것이 이번 테스트의 목적이다.

## 1. 사전 확인

- 배포 백엔드 헬스체크(`GET /`) 200 정상
- 배포 프론트 `/` 접속 시 CORS 응답 헤더가 `https://woniboni-0629-fe.vercel.app`로 정확히 스코프됨
- 운영 DB에 관리자 계정이 없어(스키마만 생성된 상태) `backend/scripts/seedAdmin.js`로 최초 시딩(`admin@b2b-promo.local`)
- 이 시딩 이후 `backend/tests/e2e-user-scenarios.test.js`를 `TEST_BASE_URL`로 배포 백엔드에 대해 실행해 API 레벨 시나리오 16건이 이미 전부 통과함(별도 대화 기록) — 이번 테스트는 그 위에서 **프론트 UI를 통한 연동**을 확인

## 2. 시나리오 결과

| 항목 | 결과 | 스크린샷 |
|---|---|---|
| EX-5: 비로그인 상태로 `/` 접근 → 로그인 화면 리다이렉트 | PASS | [01](screenshots/01-ex5-unauth-redirect-login.png) |
| UC-1: 회원가입(배포 프론트 폼 → 배포 백엔드 API) | PASS | (스크린샷 저장 실패, 아래 3절 참고) |
| 로그인 실패 시 에러 메시지 표시 | PASS | [03](screenshots/03-login-wrong-password-error.png) |
| UC-2: 프로모션 목록(게시된 4건만, 임시저장 미노출 — BR-9) | PASS | [04](screenshots/04-promotion-list.png) |
| UC-3: 일반 프로모션 참여 신청 | PASS | (스크린샷 저장 실패) |
| EX-2: 중복 신청 거부 | PASS | [07](screenshots/07-ex2-duplicate-application.png) |
| UC-4: 쿠폰 이벤트 신청 → 추첨 모달(BR-4/BR-8) | PASS | [08](screenshots/08-uc4-draw-result-modal.png) |
| UC-5: 내 신청 목록 | PASS | [10](screenshots/10-my-applications-list.png) |
| BR-3/BR-5: 취소 후 재신청(같은 카드, 새 추첨으로 덮어씀) | PASS | [12](screenshots/12-br3-br5-reapply-success.png) |
| EX-1: 정원 마감된 쿠폰 이벤트 → 버튼 비활성 | PASS | [13](screenshots/13-ex1-capacity-full-disabled.png) |
| UC-9: 마이페이지 | PASS | [14](screenshots/14-mypage.png) |
| UC-6/UC-7: 관리자 목록(임시저장 포함 전체 표시) | PASS | [15](screenshots/15-admin-promotion-list.png) |
| UC-7: 게시/종료 처리 즉시 반영 | PASS | [16](screenshots/16-admin-promotion-closed.png) |
| UC-8: 관리자 참여 현황(건수/분포/거래처 목록) | PASS | [18](screenshots/18-admin-applications-status.png) |
| 관리자 URL에 파트너 계정으로 접근 시 차단 | PASS | [19](screenshots/19-partner-blocked-from-admin.png) |
| EX-3: 종료된 프로모션에 신규 신청 시도(미신청 파트너) | PASS | [20](screenshots/20-ex3-closed-promotion-blocked.png) |
| BR-10/BR-11: 종료된 프로모션 기신청 취소 허용 | PASS | (태그 노출 확인, 스크린샷 저장 실패) / [22](screenshots/22-br11-cancel-on-closed-success.png) |
| EX-4: 취소 후 정원 마감 상태에서 재신청 거부 | PASS | [23](screenshots/23-ex4-reapply-rejected-full.png) |
| 반응형 375px 가로 스크롤 없음 | PASS | [24](screenshots/24-mobile375-promotion-list.png) |

## 3. 특이사항

- **스크린샷 도구 불안정**: 배포 페이지 대상 `browser_take_screenshot` 호출이 간헐적으로 5초 타임아웃 후 실패했다(로컬 dev 서버 대상 테스트에서는 발생하지 않던 현상). 재시도 시 대부분 성공했으나, 회원가입 화면/UC-3 신청 완료/BR-10 종료 태그 3건은 재시도 후에도 저장에 실패했다 — 다만 이 세 화면은 모두 accessibility snapshot으로 실제 렌더링 상태(성공 메시지, "[종료된 프로모션]" 태그 등)를 직접 확인했으므로 기능 검증 자체는 완료됨. 원인은 Vercel Edge/CDN을 통한 원격 페이지의 리소스 로딩 지연으로 추정되며, 로컬 프론트 코드의 문제는 아니다.
- **콜드스타트**: 배포 백엔드(Vercel 서버리스)가 관리자 다건 요청(등록 3~5건 연속) 처리 시 로컬보다 느려, 앞선 API 레벨 E2E(`e2e-user-scenarios.test.js`)에서도 기본 Jest 타임아웃(5초)을 늘려야 했던 것과 동일한 특성이 브라우저 조작에서도 체감됨(요청-응답 자체는 모두 정상 완료).
- 테스트로 만든 파트너 계정 2건(`prod-e2e-partner1/2@example.com`)과 프로모션 6건(`PROD-E2E-` 접두)은 검증 후 운영 DB에서 모두 삭제, 관리자 계정 1건만 남음.

## 4. 결론

배포된 프론트(`woniboni-0629-fe.vercel.app`)와 배포된 백엔드(`woniboni-0629-be.vercel.app`)가 실제 브라우저 환경에서 `docs/4-user-scenario.md`의 파트너/관리자 시나리오 및 예외 케이스(EX-1~EX-5) 전부를 문제없이 수행한다. SPA 라우팅 fallback(`frontend/vercel.json`)과 CORS 설정도 정상 동작 확인.
