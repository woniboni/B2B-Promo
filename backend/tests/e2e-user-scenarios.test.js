// E2E: docs/4-user-scenario.md 시나리오 전체를 실제 실행 중인 서버(HTTP)에 대해 순서대로 재현한다.
// 각 describe 제목은 문서의 절 번호를 그대로 참조한다. 개별 API 단위 검증은 이미
// tests/auth.test.js 등에서 다루므로, 여기서는 "시나리오가 문서 그대로 흘러가는지"에 집중한다.
require('dotenv').config();
const request = require('supertest');

const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');

const EMAIL_PREFIX = 'test-e2e-';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@b2b-promo.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const PASSWORD = 'password123';

function uniqueEmail(tag) {
  return `${EMAIL_PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function cleanupTestAccounts() {
  await pool.query(
    `DELETE FROM partners WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
}

describe('B2B-Promo 사용자 시나리오 E2E (docs/4-user-scenario.md)', () => {
  let adminToken;
  const createdPromotionIds = [];

  const partners = {}; // tag -> { token, email }
  const shared = {}; // describe 블록 간 공유 상태(생성한 프로모션 id, 추첨 결과 등)

  async function signupAndLogin(tag, partnerName) {
    const email = uniqueEmail(tag);
    const signupRes = await request(app).post('/auth/signup').send({
      email,
      password: PASSWORD,
      name: `담당자-${tag}`,
      phone: '010-0000-0000',
      partner_name: partnerName,
    });
    if (signupRes.status !== 201) {
      throw new Error(`signup failed for ${tag}: ${JSON.stringify(signupRes.body)}`);
    }
    const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    partners[tag] = { token: loginRes.body.access_token, email, partnerName };
    return partners[tag];
  }

  async function createPromotion(adminTok, { title, type, couponEvent = false }) {
    const res = await request(app)
      .post('/admin/promotions')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ title, type, status: 'draft', coupon_event: couponEvent });
    expect(res.status).toBe(201);
    createdPromotionIds.push(res.body.id);
    return res.body.id;
  }

  async function publish(adminTok, promotionId) {
    const res = await request(app)
      .patch(`/admin/promotions/${promotionId}/status`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ status: 'published' });
    expect(res.status).toBe(200);
  }

  async function close(adminTok, promotionId) {
    const res = await request(app)
      .patch(`/admin/promotions/${promotionId}/status`)
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ status: 'closed' });
    expect(res.status).toBe(200);
  }

  beforeAll(async () => {
    await cleanupTestAccounts();

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.access_token;

    await signupAndLogin('a', '테스트거래처-E2E-A');
    await signupAndLogin('b', '테스트거래처-E2E-B');
  }, 30000);

  afterAll(async () => {
    if (createdPromotionIds.length > 0) {
      await pool.query(
        `DELETE FROM draw_results WHERE application_id IN (SELECT id FROM applications WHERE promotion_id = ANY($1::int[]))`,
        [createdPromotionIds]
      );
      await pool.query('DELETE FROM applications WHERE promotion_id = ANY($1::int[])', [createdPromotionIds]);
      await pool.query('DELETE FROM coupon_events WHERE promotion_id = ANY($1::int[])', [createdPromotionIds]);
      await pool.query('DELETE FROM promotions WHERE id = ANY($1::int[])', [createdPromotionIds]);
    }
    await cleanupTestAccounts();
    await pool.end();
  });

  describe('1.1 회원가입 및 로그인 (UC-1)', () => {
    test('비로그인 상태로 보호 자원 접근 시 거부된다(BR-1, EX-5)', async () => {
      const res = await request(app).get('/promotions');
      expect(res.status).toBe(401);
    });

    test('회원가입 시 User+Partner가 함께 생성되고, 로그인 시 Access/Refresh 토큰이 발급된다', async () => {
      const email = uniqueEmail('signup-flow');
      const signupRes = await request(app).post('/auth/signup').send({
        email,
        password: PASSWORD,
        name: '담당자-signup-flow',
        phone: '010-1234-5678',
        partner_name: '테스트거래처-E2E-signup',
      });
      expect(signupRes.status).toBe(201);
      expect(signupRes.body.user).toBeTruthy();
      expect(signupRes.body.partner).toBeTruthy();

      const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.access_token).toBeTruthy();
      expect(loginRes.body.refresh_token).toBeTruthy();
    });
  });

  describe('2.1 프로모션 게시 및 쿠폰 이벤트 설정 (UC-7, BR-9, BR-6) — 이후 시나리오의 선행 준비', () => {
    let promoGeneral;
    let promoCoupon;
    let promoDraft;
    let promoToClose;

    test('관리자가 일반/쿠폰 프로모션을 등록하고 게시하면 즉시 거래처 목록에 노출된다', async () => {
      promoGeneral = await createPromotion(adminToken, { title: '[E2E] 신제품 시식', type: 'tasting' });
      promoCoupon = await createPromotion(adminToken, { title: '[E2E] 1+1 쿠폰이벤트', type: 'bogo', couponEvent: true });
      promoToClose = await createPromotion(adminToken, { title: '[E2E] 가격할인(종료예정)', type: 'price_discount' });

      await publish(adminToken, promoGeneral);
      await publish(adminToken, promoCoupon);
      await publish(adminToken, promoToClose);

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(listRes.status).toBe(200);
      const ids = listRes.body.map((p) => p.id);
      expect(ids).toContain(promoGeneral);
      expect(ids).toContain(promoCoupon);
      expect(ids).toContain(promoToClose);

      const couponEntry = listRes.body.find((p) => p.id === promoCoupon);
      expect(couponEntry.coupon_event).toBeTruthy();
      expect(couponEntry.coupon_event.capacity).toBe(50);

      // 이후 describe 블록에서 재사용(비동기 완료 후 실제 id가 채워진 시점에 공유)
      Object.assign(shared, { promoGeneral, promoCoupon, promoToClose });
    });

    test('3.1 임시저장 프로모션은 거래처 목록에 노출되지 않는다 (UC-6, BR-9)', async () => {
      promoDraft = await createPromotion(adminToken, { title: '[E2E] 작성중 프로모션', type: 'sample' });

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(listRes.body.map((p) => p.id)).not.toContain(promoDraft);

      const adminListRes = await request(app)
        .get('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminListRes.body.map((p) => p.id)).toContain(promoDraft);

      shared.promoDraft = promoDraft;
    });
  });

  describe('1.2 진행 중인 프로모션 목록/상세 조회 (UC-2)', () => {
    test('게시된 프로모션 상세에 유형·설명·쿠폰이벤트 잔여 정원이 포함된다', async () => {
      const { promoCoupon } = shared;
      const res = await request(app)
        .get(`/promotions/${promoCoupon}`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('bogo');
      expect(res.body.coupon_event.applied_count).toBe(0);
      expect(res.body.coupon_event.capacity).toBe(50);
    });
  });

  describe('1.3 일반 프로모션 참여 신청 (UC-3)', () => {
    test('참여 신청 시 Application이 상태=신청됨으로 생성된다', async () => {
      const { promoGeneral } = shared;
      const res = await request(app)
        .post(`/promotions/${promoGeneral}/apply`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(res.status).toBe(201);
      expect(res.body.application.status).toBe('applied');
      expect(res.body.draw_result).toBeNull();
    });
  });

  describe('1.4 쿠폰 이벤트 참여 신청 및 즉시 추첨 (UC-3 → UC-4)', () => {
    test('신청 성공 시 즉시 할인율이 추첨되고 만료일이 함께 표시된다(BR-4, BR-8)', async () => {
      const { promoCoupon } = shared;
      const res = await request(app)
        .post(`/promotions/${promoCoupon}/apply`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(res.status).toBe(201);
      expect([5, 10, 15, 20]).toContain(Number(res.body.draw_result.discount_rate));
      expect(res.body.draw_result.expires_at).toBeTruthy();

      const confirmed = new Date(res.body.draw_result.confirmed_at);
      const expires = new Date(res.body.draw_result.expires_at);
      const diffDays = (expires - confirmed) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(27); // 확정일 + 1개월(BR-8)

      shared.firstDrawApplicationId = res.body.application.id;
      shared.firstDiscountRate = Number(res.body.draw_result.discount_rate);
    });
  });

  describe('1.5 예외: 선착순 50명 마감 후 신청 시도 (EX-1, BR-6, BR-7)', () => {
    let promoFull;

    test('정원이 이미 49명인 상태에서 50번째는 성공, 51번째는 "마감되었습니다"로 거부된다', async () => {
      promoFull = await createPromotion(adminToken, { title: '[E2E] 마감임박 쿠폰', type: 'bogo', couponEvent: true });
      await publish(adminToken, promoFull);

      const ceRes = await pool.query('SELECT id FROM coupon_events WHERE promotion_id = $1', [promoFull]);
      await pool.query('UPDATE coupon_events SET applied_count = 49 WHERE id = $1', [ceRes.rows[0].id]);

      const partnerX = await signupAndLogin('full-50th', '테스트거래처-E2E-50th');
      const okRes = await request(app)
        .post(`/promotions/${promoFull}/apply`)
        .set('Authorization', `Bearer ${partnerX.token}`);
      expect(okRes.status).toBe(201);

      const partnerY = await signupAndLogin('full-51st', '테스트거래처-E2E-51st');
      const rejectedRes = await request(app)
        .post(`/promotions/${promoFull}/apply`)
        .set('Authorization', `Bearer ${partnerY.token}`);
      expect(rejectedRes.status).toBe(409);
      expect(rejectedRes.body.error).toBe('마감되었습니다.');

      const afterCe = await pool.query('SELECT applied_count FROM coupon_events WHERE id = $1', [ceRes.rows[0].id]);
      expect(afterCe.rows[0].applied_count).toBe(50); // 51번째 시도로 초과되지 않음(BR-7)

      const appCount = await pool.query('SELECT COUNT(*)::int AS c FROM applications WHERE promotion_id = $1', [promoFull]);
      expect(appCount.rows[0].c).toBe(1); // 거부된 요청은 흔적을 남기지 않음(트랜잭션 롤백)
    });
  });

  describe('1.6 참여신청 취소 후 재신청 (UC-5, BR-3, BR-5, EX-2, EX-4)', () => {
    test('취소해도 새 행이 생기지 않고, 재신청 시 같은 application_id에 draw_result가 덮어써진다', async () => {
      const { promoCoupon, firstDrawApplicationId } = shared;

      const cancelRes = await request(app)
        .patch(`/applications/${firstDrawApplicationId}/cancel`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('canceled');

      const reapplyRes = await request(app)
        .post(`/promotions/${promoCoupon}/apply`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(reapplyRes.status).toBe(201);
      expect(reapplyRes.body.application.id).toBe(firstDrawApplicationId); // 새 행이 아니라 같은 행
      expect(reapplyRes.body.application.status).toBe('applied');
      expect([5, 10, 15, 20]).toContain(Number(reapplyRes.body.draw_result.discount_rate));

      const drawRows = await pool.query('SELECT COUNT(*)::int AS c FROM draw_results WHERE application_id = $1', [
        firstDrawApplicationId,
      ]);
      expect(drawRows.rows[0].c).toBe(1); // 덮어쓰기, 행 2개로 늘지 않음(BR-5)
    });

    test('취소 후 정원이 마감된 상태에서 재신청하면 거부된다(EX-4)', async () => {
      // 1.5에서 만든 promoFull은 이미 50/50 마감 상태. partnerX(50번째 성공자)가 취소 후 재신청 시도.
      const partnerX = partners['full-50th'];
      const myApps = await request(app)
        .get('/applications/me')
        .set('Authorization', `Bearer ${partnerX.token}`);
      const myApplication = myApps.body[0];

      const cancelRes = await request(app)
        .patch(`/applications/${myApplication.id}/cancel`)
        .set('Authorization', `Bearer ${partnerX.token}`);
      expect(cancelRes.status).toBe(200);

      const reapplyRes = await request(app)
        .post(`/promotions/${myApplication.promotion_id}/apply`)
        .set('Authorization', `Bearer ${partnerX.token}`);
      expect(reapplyRes.status).toBe(409);
      expect(reapplyRes.body.error).toBe('마감되었습니다.');
    });
  });

  describe('1.7 예외: 종료된 프로모션 (BR-11, EX-3, BR-10)', () => {
    test('신청 건 취소는 허용되고, 신규 신청은 거부된다', async () => {
      const { promoToClose } = shared;

      const applyRes = await request(app)
        .post(`/promotions/${promoToClose}/apply`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(applyRes.status).toBe(201);

      await close(adminToken, promoToClose);

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(listRes.body.map((p) => p.id)).not.toContain(promoToClose); // BR-9/BR-10

      const cancelRes = await request(app)
        .patch(`/applications/${applyRes.body.application.id}/cancel`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(cancelRes.status).toBe(200); // 종료돼도 기신청 취소는 허용(BR-11)

      const newApplyRes = await request(app)
        .post(`/promotions/${promoToClose}/apply`)
        .set('Authorization', `Bearer ${partners.b.token}`);
      expect(newApplyRes.status).toBe(409); // 신규 신청은 거부(EX-3)
    });
  });

  describe('1.8 내 참여신청 목록 조회 (UC-5, BR-8, BR-10)', () => {
    test('신청됨/취소됨 상태와 종료된 프로모션 건이 모두 포함되고, 당첨 건에는 할인율/만료일이 표시된다', async () => {
      const res = await request(app)
        .get('/applications/me')
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(res.status).toBe(200);

      const statuses = res.body.map((a) => a.status);
      expect(statuses).toContain('applied');
      expect(statuses).toContain('canceled');

      const closedEntry = res.body.find((a) => a.promotion.id === shared.promoToClose);
      expect(closedEntry).toBeTruthy();
      expect(closedEntry.promotion.status).toBe('closed'); // 종료돼도 목록엔 계속 포함(BR-10)

      const couponEntry = res.body.find((a) => a.promotion.id === shared.promoCoupon);
      expect(couponEntry.draw_result).toBeTruthy();
      expect(couponEntry.draw_result.expires_at).toBeTruthy();
    });
  });

  describe('2.2 프로모션 종료 처리 (UC-7, BR-10, BR-11)', () => {
    test('종료 처리 즉시 거래처 목록에서 제외되지만 관리자 목록에는 남는다', async () => {
      const { promoToClose } = shared;

      const adminListRes = await request(app)
        .get('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`);
      const closedEntry = adminListRes.body.find((p) => p.id === promoToClose);
      expect(closedEntry.status).toBe('closed');
    });
  });

  describe('2.3 프로모션별 참여 현황 확인 (UC-8)', () => {
    test('신청됨/취소됨 건수, 정원 대비 누적 신청 수, 할인율 분포가 반환된다', async () => {
      const { promoCoupon } = shared;
      const res = await request(app)
        .get(`/admin/promotions/${promoCoupon}/applications`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.applied_status_count).toBe(1); // 현재 활성 신청 1건(취소 후 재신청으로 복귀)
      // coupon_event.applied_count는 취소해도 감소하지 않는 누적 카운터다(BR-6):
      // 1.4의 최초 신청 + 1.6의 취소 후 재신청, 총 2회 증가했다.
      expect(res.body.coupon_event.applied_count).toBe(2);
      expect(res.body.coupon_event.capacity).toBe(50);

      const distTotal = [5, 10, 15, 20].reduce((sum, r) => sum + (res.body.discount_distribution[r] || 0), 0);
      expect(distTotal).toBe(1);
    });

    test('거래처 담당자 토큰으로는 참여 현황 조회가 거부된다', async () => {
      const { promoCoupon } = shared;
      const res = await request(app)
        .get(`/admin/promotions/${promoCoupon}/applications`)
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('3.2 공통: 마이페이지 정보 조회/수정 (UC-9)', () => {
    test('내 정보를 조회/수정하고 비밀번호를 변경할 수 있다', async () => {
      const meRes = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.password_hash).toBeUndefined();

      const updateRes = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${partners.a.token}`)
        .send({ name: '담당자-A-개명', phone: '010-9999-9999' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('담당자-A-개명');

      const wrongPwRes = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${partners.a.token}`)
        .send({ current_password: 'wrong-password', new_password: 'newpassword123' });
      expect(wrongPwRes.status).toBe(400);

      const changePwRes = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${partners.a.token}`)
        .send({ current_password: PASSWORD, new_password: 'newpassword123' });
      expect(changePwRes.status).toBe(200);

      const reloginRes = await request(app)
        .post('/auth/login')
        .send({ email: partners.a.email, password: 'newpassword123' });
      expect(reloginRes.status).toBe(200);
    });
  });
});
