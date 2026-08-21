# E2E 테스트 리포트 - B2B-Promo

- 실행일: 2026-08-21
- 대상: 실행 중인 개발 서버 (프론트 `http://localhost:5173`, 백엔드 `http://localhost:3000`)
- 도구: Playwright MCP(브라우저 시나리오), Node 스크립트(QA-1/QA-2 자동 검증)
- 근거 문서: `docs/4-user-scenario.md`, `docs/9-plan.md` 4절(검증 QA)

## 1. 요약

| 구분 | 결과 |
|---|---|
| QA-1 동시성(선착순 50명) | ✅ PASS (2회 반복 재현) |
| QA-2 추첨 확률분포 | ✅ PASS (20,000회 시행) |
| QA-3 예외 케이스(EX-1~EX-5) | ✅ PASS (5종 전부 브라우저 실측) |
| 주요 화면(9종) | ✅ 전부 스크린캡처 확보 |
| 반응형(375px) | ✅ 가로 스크롤 없음 확인 |

테스트에 사용한 임시 프로모션(`E2E-` 접두) 6건과 계정 2건(`qa-e2e-*`)은 검증 후 모두 정리했다.

---

## 2. QA-1: 선착순 50명 동시성 검증 (BR-6, BR-7)

- 스크립트: `backend/scripts/verifyConcurrency.js` (신규 작성)
- 방법: 관리자 API로 쿠폰 이벤트 프로모션 1건 생성 → 서로 다른 파트너 100개 계정을 회원가입/로그인 → 100개 토큰으로 `POST /promotions/:id/apply`를 `Promise.all`로 동시 발사 → 결과 집계 및 DB 실측
- 로그: [`logs/qa1-concurrency.log`](logs/qa1-concurrency.log)

```
성공(201): 50건
거부(409): 50건
DB coupon_events.applied_count=50 (capacity=50)
DB applications 행 수=50
[QA-1] PASS
```

2회 연속 실행(각기 다른 프로모션 id 385, 386, 387)해 동일하게 정확히 50건 성공/50건 거부, `applied_count` 50 초과 없음을 재현했다(완료조건 "반복 실행해도 동일 결과 재현" 충족). 테스트로 생성한 프로모션/계정은 스크립트 종료 시 자동 정리된다.

## 3. QA-2: 추첨 확률분포 검증 (BR-4)

- 스크립트: `backend/scripts/verifyDrawDistribution.js` (신규 작성, `drawDiscountRate()` 순수함수 재사용)
- 시행 20,000회(완료조건 최소 200회 충족)
- 로그: [`logs/qa2-draw-distribution.log`](logs/qa2-draw-distribution.log)

| 할인율 | 목표 비율 | 실측 비율 | 오차 |
|---|---|---|---|
| 5% | 40% | 39.6~39.8% | 0.24~0.42pp |
| 10% | 30% | 30.1~30.2% | 0.10~0.18pp |
| 15% | 20% | 19.99~20.05% | 0.01~0.05pp |
| 20% | 10% | 10.01~10.33% | 0.01~0.33pp |

모든 오차가 ±10%p 이내이며, 5/10/15/20 이외의 값은 한 번도 나오지 않았다. **PASS**

## 4. QA-3: 예외 케이스 수동(브라우저) QA (EX-1 ~ EX-5)

파트너 계정 2개(`qa-e2e-partner1/2`)와 프로모션 6건(일반/쿠폰/마감쿠폰/종료예정/임시저장/EX4전용)을 준비해 실제 브라우저에서 순회했다.

| 항목 | 시나리오 | 결과 | 스크린샷 |
|---|---|---|---|
| EX-1 | 정원(50/50) 마감된 쿠폰 이벤트에 신규 신청 시도 | 버튼이 `disabled` 처리되고 "마감되었습니다(0/50명 남음)" 안내, 신청 자체가 불가능 | [13](screenshots/13-ex1-capacity-full-disabled.png) |
| EX-2 | 이미 신청(`applied`)한 프로모션에 중복 신청 시도 | "이미 신청한 프로모션입니다." 안내, 새 레코드 생성 없음 | [07](screenshots/07-ex2-duplicate-application.png) |
| EX-2(분기) | `canceled` 상태에서 재신청 | 거부되지 않고 정상적으로 `canceled`→`applied` 전환, 새 카드가 아닌 기존 카드 갱신 | [11](screenshots/11-application-canceled-state.png), [12](screenshots/12-br3-br5-reapply-success.png) |
| EX-3 | 종료된(`closed`) 프로모션에 URL 직접 접근 후 신규 신청 시도(미신청 파트너) | 신청 버튼 자체가 없고 "이 프로모션은 종료되어 신규 참여 신청이 불가합니다." 안내 | [20](screenshots/20-ex3-closed-promotion-blocked.png) |
| EX-3(연계) | 종료된 프로모션의 기존 신청 건 | 내 신청 목록에서 "[종료된 프로모션]" 태그와 함께 계속 조회되고 취소 가능(BR-10/BR-11) | [21](screenshots/21-br10-br11-closed-tag-cancel-available.png), [22](screenshots/22-br11-cancel-on-closed-success.png) |
| EX-4 | 취소 후 정원이 마감된 상태에서 재신청 | "마감되었습니다." 안내로 거부, 상태는 `canceled` 유지 | [23](screenshots/23-ex4-reapply-rejected-full.png) |
| EX-5 | 비로그인 상태로 보호 URL(`/`) 직접 접근 | 로그인 화면(`/login`)으로 강제 이동 | [01](screenshots/01-ex5-unauth-redirect-login.png) |

추가로 발견한 정상 동작(요구 밖 확인):
- 관리자 URL(`/admin`)에 파트너 계정으로 직접 접근 시 파트너 홈(`/`)으로 리다이렉트됨 — [19](screenshots/19-partner-blocked-from-admin.png)
- 임시저장(`draft`) 프로모션은 파트너 목록에 노출되지 않음(BR-9), 관리자 목록에는 노출됨 — 관리자 화면([15](screenshots/15-admin-promotion-list.png))과 파트너 목록 대조로 확인

**QA-3 5개 항목 모두 PASS.**

---

## 5. 주요 화면 스크린캡처 (9개 화면 + 부가 상태)

| # | 화면 | 스크린샷 |
|---|---|---|
| 1 | 회원가입 | [02](screenshots/02-signup-screen.png) |
| 2 | 로그인(성공/실패) | [03](screenshots/03-login-wrong-password-error.png) |
| 3 | 프로모션 목록 | [04](screenshots/04-promotion-list.png) |
| 4 | 프로모션 상세(일반) | [05](screenshots/05-promotion-detail-normal.png), 신청완료 [06](screenshots/06-uc3-apply-success.png) |
| 5 | 프로모션 상세(쿠폰) + 추첨 모달 | [08](screenshots/08-promotion-detail-coupon.png), [09](screenshots/09-uc4-draw-result-modal.png) |
| 6 | 내 신청 목록 | [10](screenshots/10-my-applications-list.png) |
| 7 | 마이페이지 | [14](screenshots/14-mypage.png) |
| 8 | 관리자 프로모션 목록/등록/현황 | [15](screenshots/15-admin-promotion-list.png), [17](screenshots/17-admin-promotion-form.png), [18](screenshots/18-admin-applications-status.png) |
| 9 | 관리자 종료 처리 | [16](screenshots/16-admin-promotion-closed.png) |
| 반응형 375px | 내 신청 목록 / 관리자 카드형 목록 | [24](screenshots/24-mobile375-my-applications.png), [26](screenshots/26-mobile375-admin-card-list.png) |

375px 뷰포트에서 `document.documentElement.scrollWidth === clientWidth`(가로 스크롤 없음)를 스크립트로 실측 확인했다(9-plan.md FE-9가 이미 9개 화면 전체를 검증 완료했으므로 본 E2E에서는 대표 화면만 재확인).

---

## 6. 핵심 시나리오 연속 시연 확인

`docs/9-plan.md` 5절 "최종 완료 기준"의 전 구간을 실제로 이어서 수행했다:

회원가입 → 로그인 → 프로모션 조회 → 참여 신청(일반) → 중복 신청 거부(EX-2) → 쿠폰 이벤트 참여 신청 → 추첨 결과 확인(BR-4/BR-8) → 내 신청 목록 → 취소 → 재신청(BR-3/BR-5, 새 추첨) 까지 끊김 없이 동작했다.

관리자 시나리오도 연속 확인: 로그인 → (임시저장 프로모션) 게시 전환 → 참여 현황 확인 → 프로모션 종료 → 파트너 목록에서 즉시 제외 확인 → 기존 신청자의 취소 권한 유지 확인(BR-11).

---

## 7. 재현 방법

```bash
# QA-1, QA-2 (백엔드 dev 서버가 이미 떠 있어야 함)
cd backend
node scripts/verifyDrawDistribution.js
node scripts/verifyConcurrency.js
```

QA-3 및 화면별 시나리오는 본 리포트의 스크린샷과 함께 수동 재현 절차가 위 4~5절에 서술되어 있다.
