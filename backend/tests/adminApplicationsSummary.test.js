// BE-7: 관리자 참여 현황 API (UC-8) 검증
// 관련 문서: docs/1-domain-definition.md UC-8/BR-6, docs/9-plan.md BE-7 완료조건, docs/swagger.json AdminApplicationsSummary
//
// ponytail: 구현(GET /admin/promotions/:id/applications)이 아직 반영되지 않았다면 이 파일의 테스트는 지금 실패한다 —
// 병렬 구현 완료(nodemon 재시작) 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');

const EMAIL_PREFIX = 'test-be7-';
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

describe('BE-7 관리자 참여 현황 API (UC-8)', () => {
  let adminToken;
  const createdPromotionIds = []; // 정리 대상 (admin API로 생성한 프로모션)
  const partners = {}; // tag -> { token, userId, partnerName }

  async function createPartner(tag) {
    const email = uniqueEmail(tag);
    const partnerName = `테스트거래처-be7-${tag}`;
    const signupRes = await request(app).post('/auth/signup').send({
      email,
      password: PASSWORD,
      name: `테스트담당자-${tag}`,
      phone: '010-0000-0000',
      partner_name: partnerName,
    });
    expect(signupRes.status).toBe(201);

    const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);

    partners[tag] = { token: loginRes.body.access_token, userId: loginRes.body.user.id, partnerName };
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

  let promoCoupon; // A,B,C 신청, C는 이후 취소
  let promoGeneral; // 쿠폰 없는 일반 프로모션, D 신청

  beforeAll(async () => {
    await cleanupTestAccounts();

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.access_token;

    await Promise.all(['a', 'b', 'c', 'd'].map(createPartner));

    // 쿠폰 이벤트 프로모션: A, B, C 신청 → C는 이후 취소
    promoCoupon = await createPromotion({ title: '[테스트] BE7-쿠폰현황', couponEvent: true });
    await apply(partners.a.token, promoCoupon);
    await apply(partners.b.token, promoCoupon);
    const cApply = await apply(partners.c.token, promoCoupon);
    const cancelRes = await request(app)
      .patch(`/applications/${cApply.application.id}/cancel`)
      .set('Authorization', `Bearer ${partners.c.token}`);
    expect(cancelRes.status).toBe(200);

    // 쿠폰 없는 일반 프로모션: D 신청
    promoGeneral = await createPromotion({ title: '[테스트] BE7-일반현황' });
    await apply(partners.d.token, promoGeneral);
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
    const res = await request(app).get(`/admin/promotions/${promoCoupon}/applications`);
    expect(res.status).toBe(401);
  });

  test('거래처 담당자 토큰으로 호출 시 403이 반환된다 (완료조건1)', async () => {
    const res = await request(app)
      .get(`/admin/promotions/${promoCoupon}/applications`)
      .set('Authorization', `Bearer ${partners.a.token}`);
    expect(res.status).toBe(403);
  });

  test('존재하지 않는 프로모션 id 호출 시 404가 반환된다', async () => {
    const res = await request(app)
      .get('/admin/promotions/999999999/applications')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  describe('GET /admin/promotions/:id/applications (쿠폰 이벤트 프로모션)', () => {
    let body;

    beforeAll(async () => {
      const res = await request(app)
        .get(`/admin/promotions/${promoCoupon}/applications`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      body = res.body;
    });

    test('promotion_id가 대상 프로모션과 일치한다', () => {
      expect(body.promotion_id).toBe(promoCoupon);
    });

    test('applied_status_count/canceled_count가 실제 applications 데이터와 일치한다 (완료조건2)', async () => {
      const dbCounts = await pool.query(
        `SELECT status, count(*)::int AS count FROM applications WHERE promotion_id = $1 GROUP BY status`,
        [promoCoupon]
      );
      const appliedRow = dbCounts.rows.find((r) => r.status === 'applied');
      const canceledRow = dbCounts.rows.find((r) => r.status === 'canceled');
      expect(body.applied_status_count).toBe(appliedRow ? appliedRow.count : 0);
      expect(body.canceled_count).toBe(canceledRow ? canceledRow.count : 0);
      // 시나리오 상: A,B는 applied 유지, C는 취소
      expect(body.applied_status_count).toBe(2);
      expect(body.canceled_count).toBe(1);
    });

    test('coupon_event.applied_count/capacity가 반환되고, 취소해도 applied_count는 감소하지 않는다 (완료조건3, BR-6)', async () => {
      expect(body.coupon_event).toBeTruthy();
      expect(body.coupon_event.capacity).toBe(50);
      expect(body.coupon_event.applied_count).toBe(3); // A,B,C 모두 신청 성공 → 취소해도 유지
    });

    test('discount_distribution 합계가 draw_results 총 건수와 일치한다 (완료조건4)', async () => {
      const dbRows = await pool.query(
        `SELECT dr.discount_rate, count(*)::int AS count
         FROM draw_results dr
         JOIN applications ap ON ap.id = dr.application_id
         WHERE ap.promotion_id = $1
         GROUP BY dr.discount_rate`,
        [promoCoupon]
      );
      const expectedTotal = dbRows.rows.reduce((sum, r) => sum + r.count, 0);

      expect(body.discount_distribution).toBeTruthy();
      const actualTotal = [5, 10, 15, 20].reduce(
        (sum, rate) => sum + (body.discount_distribution[rate] || 0),
        0
      );
      expect(actualTotal).toBe(expectedTotal);
      expect(actualTotal).toBe(3); // A,B,C 모두 신청 성공 시 추첨됨 (취소해도 draw_results는 남음)

      for (const row of dbRows.rows) {
        expect(body.discount_distribution[Number(row.discount_rate)]).toBe(row.count);
      }
    });

    test('applications 목록에 partner_name/status/applied_at이 포함되고 취소건은 status=canceled이다 (완료조건5)', () => {
      expect(Array.isArray(body.applications)).toBe(true);
      expect(body.applications.length).toBe(3);

      const entryA = body.applications.find((e) => e.partner_name === partners.a.partnerName);
      const entryC = body.applications.find((e) => e.partner_name === partners.c.partnerName);

      expect(entryA).toBeTruthy();
      expect(entryA.status).toBe('applied');
      expect(entryA.applied_at).toBeTruthy();

      expect(entryC).toBeTruthy();
      expect(entryC.status).toBe('canceled');
      expect(entryC.applied_at).toBeTruthy();

      for (const entry of body.applications) {
        expect(typeof entry.partner_name).toBe('string');
        expect(['applied', 'canceled']).toContain(entry.status);
        expect(entry.applied_at).toBeTruthy();
      }
    });
  });

  describe('GET /admin/promotions/:id/applications (쿠폰 이벤트 없는 일반 프로모션)', () => {
    test('coupon_event는 null이고 discount_distribution은 전부 0이다', async () => {
      const res = await request(app)
        .get(`/admin/promotions/${promoGeneral}/applications`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.coupon_event).toBeNull();
      expect(res.body.applied_status_count).toBe(1);
      expect(res.body.canceled_count).toBe(0);
      for (const rate of [5, 10, 15, 20]) {
        expect(res.body.discount_distribution[rate] || 0).toBe(0);
      }
      expect(res.body.applications.length).toBe(1);
      expect(res.body.applications[0].partner_name).toBe(partners.d.partnerName);
      expect(res.body.applications[0].discount_rate).toBeFalsy();
    });
  });
});
