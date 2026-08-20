// BE-6: 내 참여신청 목록 API (UC-5) 검증
// 관련 문서: docs/1-domain-definition.md UC-5, BR-3/BR-8/BR-10/BR-11, docs/9-plan.md BE-6 완료조건, docs/swagger.json
//
// ponytail: 구현(GET /applications/me)이 아직 반영되지 않았다면 이 파일의 테스트는 지금 실패한다 —
// 병렬 구현 완료(nodemon 재시작) 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');

const EMAIL_PREFIX = 'test-be6-';
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

describe('BE-6 내 참여신청 목록 API (UC-5)', () => {
  let adminToken;
  const createdPromotionIds = []; // 정리 대상 (admin API로 생성한 프로모션)
  const partners = {}; // tag -> { token, userId }

  async function createPartner(tag) {
    const email = uniqueEmail(tag);
    const signupRes = await request(app).post('/auth/signup').send({
      email,
      password: PASSWORD,
      name: `테스트담당자-${tag}`,
      phone: '010-0000-0000',
      partner_name: `테스트거래처-be6-${tag}`,
    });
    expect(signupRes.status).toBe(201);

    const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);

    partners[tag] = { token: loginRes.body.access_token, userId: loginRes.body.user.id };
    return partners[tag];
  }

  async function createPromotion({ title, type = 'sample', couponEvent = false, status = 'published' }) {
    const res = await request(app)
      .post('/admin/promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title, type, status: 'draft', coupon_event: couponEvent });
    expect(res.status).toBe(201);
    createdPromotionIds.push(res.body.id);

    if (status !== 'draft') {
      const patchRes = await request(app)
        .patch(`/admin/promotions/${res.body.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status });
      expect(patchRes.status).toBe(200);
    }
    return res.body.id;
  }

  async function apply(token, promotionId) {
    const res = await request(app)
      .post(`/promotions/${promotionId}/apply`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    return res.body;
  }

  // 시나리오용 프로모션 id (검증 단계에서 참조)
  let promoGeneral; // A 신청, applied 유지
  let promoCoupon; // A 신청, 쿠폰 당첨
  let promoCanceled; // A 신청 후 취소
  let promoClosed; // A가 published일 때 신청 후 admin이 closed 전환
  let promoOther; // B만 신청 (A와 무관)

  beforeAll(async () => {
    await cleanupTestAccounts();

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.access_token;

    await Promise.all(['a', 'b'].map(createPartner));

    // 프로모션 1: 일반, A 신청 → applied 유지
    promoGeneral = await createPromotion({ title: '[테스트] BE6-일반신청유지' });
    await apply(partners.a.token, promoGeneral);

    // 프로모션 2: 쿠폰 이벤트, A 신청 → 당첨
    promoCoupon = await createPromotion({ title: '[테스트] BE6-쿠폰당첨', couponEvent: true });
    await apply(partners.a.token, promoCoupon);

    // 프로모션 3: 일반, A 신청 후 취소
    promoCanceled = await createPromotion({ title: '[테스트] BE6-취소건' });
    const canceledApply = await apply(partners.a.token, promoCanceled);
    const cancelRes = await request(app)
      .patch(`/applications/${canceledApply.application.id}/cancel`)
      .set('Authorization', `Bearer ${partners.a.token}`);
    expect(cancelRes.status).toBe(200);

    // 프로모션 4: published 상태에서 A 신청 후 admin이 closed로 전환
    promoClosed = await createPromotion({ title: '[테스트] BE6-종료후에도노출' });
    await apply(partners.a.token, promoClosed);
    const closeRes = await request(app)
      .patch(`/admin/promotions/${promoClosed}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'closed' });
    expect(closeRes.status).toBe(200);

    // 프로모션 5: B만 신청 (A와 무관)
    promoOther = await createPromotion({ title: '[테스트] BE6-타거래처건' });
    await apply(partners.b.token, promoOther);
  });

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

  test('토큰 없이 호출 시 401이 반환된다', async () => {
    const res = await request(app).get('/applications/me');
    expect(res.status).toBe(401);
  });

  describe('GET /applications/me (파트너 A)', () => {
    let list;

    beforeAll(async () => {
      const res = await request(app)
        .get('/applications/me')
        .set('Authorization', `Bearer ${partners.a.token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      list = res.body;
    });

    test('로그인한 거래처(A)의 신청 건만 반환되고 타 거래처(B) 건은 포함되지 않는다', () => {
      const promotionIds = list.map((a) => a.promotion_id);
      expect(promotionIds).toContain(promoGeneral);
      expect(promotionIds).toContain(promoCoupon);
      expect(promotionIds).toContain(promoCanceled);
      expect(promotionIds).toContain(promoClosed);
      expect(promotionIds).not.toContain(promoOther);
    });

    test("status='applied'와 status='canceled' 건이 모두 반환되며 상태가 구분된다", () => {
      const generalEntry = list.find((a) => a.promotion_id === promoGeneral);
      const canceledEntry = list.find((a) => a.promotion_id === promoCanceled);
      expect(generalEntry).toBeTruthy();
      expect(canceledEntry).toBeTruthy();
      expect(generalEntry.status).toBe('applied');
      expect(canceledEntry.status).toBe('canceled');
      expect(canceledEntry.canceled_at).toBeTruthy();
    });

    test('프로모션이 종료(closed)된 신청 건도 목록에 계속 포함된다 (BR-10)', () => {
      const closedEntry = list.find((a) => a.promotion_id === promoClosed);
      expect(closedEntry).toBeTruthy();
      expect(closedEntry.status).toBe('applied');
      expect(closedEntry.promotion).toBeTruthy();
      expect(closedEntry.promotion.status).toBe('closed');
    });

    test('쿠폰 이벤트 당첨 건에 discount_rate와 expires_at이 함께 반환된다 (BR-8)', () => {
      const couponEntry = list.find((a) => a.promotion_id === promoCoupon);
      expect(couponEntry).toBeTruthy();
      expect(couponEntry.draw_result).toBeTruthy();
      expect([5, 10, 15, 20]).toContain(Number(couponEntry.draw_result.discount_rate));
      expect(couponEntry.draw_result.expires_at).toBeTruthy();
    });

    test('응답에 프로모션 status가 포함되어 프론트가 "종료된 프로모션" 태그를 표시할 수 있다', () => {
      expect(list.length).toBeGreaterThan(0);
      for (const entry of list) {
        expect(entry.promotion).toBeTruthy();
        expect(typeof entry.promotion.status).toBe('string');
      }
      const generalEntry = list.find((a) => a.promotion_id === promoGeneral);
      expect(generalEntry.promotion.status).toBe('published');
    });
  });
});
