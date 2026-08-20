// BE-3: 프로모션 조회 API (UC-2) 검증
// 관련 문서: docs/1-domain-definition.md BR-9/BR-10, docs/9-plan.md BE-3 완료조건, docs/swagger.json
//
// ponytail: 구현(src/routes/promotions.routes.js, src/db/promotions.queries.js)이
// 아직 없다면 이 파일의 테스트는 지금 모듈 로드 단계에서 실패한다 — 병렬 구현 완료 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');

const EMAIL_PREFIX = 'test-promo-';

function uniqueEmail(tag) {
  return `${EMAIL_PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'password123';

async function cleanupTestAccounts() {
  await pool.query(
    `DELETE FROM partners WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
}

describe('BE-3 프로모션 조회 API (UC-2)', () => {
  let accessToken;
  let userId;

  const promotionIds = {};
  let couponEventId;

  beforeAll(async () => {
    await cleanupTestAccounts();

    const email = uniqueEmail('user');
    const signupRes = await request(app).post('/auth/signup').send({
      email,
      password: PASSWORD,
      name: '테스트담당자',
      phone: '010-1111-2222',
      partner_name: '테스트거래처-promo',
    });
    expect(signupRes.status).toBe(201);
    userId = signupRes.body.user.id;

    const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    accessToken = loginRes.body.access_token;

    // fixture: published + coupon_event
    const publishedWithCoupon = await pool.query(
      `INSERT INTO promotions (title, type, description, status, created_by)
       VALUES ($1, 'price_discount', '설명1', 'published', $2) RETURNING id`,
      ['[테스트] 게시+쿠폰', userId]
    );
    promotionIds.publishedWithCoupon = publishedWithCoupon.rows[0].id;

    const couponEvent = await pool.query(
      `INSERT INTO coupon_events (promotion_id, capacity, applied_count)
       VALUES ($1, 50, 12) RETURNING id`,
      [promotionIds.publishedWithCoupon]
    );
    couponEventId = couponEvent.rows[0].id;

    // fixture: published without coupon
    const publishedNoCoupon = await pool.query(
      `INSERT INTO promotions (title, type, description, status, created_by)
       VALUES ($1, 'sample', '설명2', 'published', $2) RETURNING id`,
      ['[테스트] 게시-쿠폰없음', userId]
    );
    promotionIds.publishedNoCoupon = publishedNoCoupon.rows[0].id;

    // fixture: draft
    const draft = await pool.query(
      `INSERT INTO promotions (title, type, description, status, created_by)
       VALUES ($1, 'tasting', '설명3', 'draft', $2) RETURNING id`,
      ['[테스트] 임시저장', userId]
    );
    promotionIds.draft = draft.rows[0].id;

    // fixture: closed
    const closed = await pool.query(
      `INSERT INTO promotions (title, type, description, status, created_by)
       VALUES ($1, 'bogo', '설명4', 'closed', $2) RETURNING id`,
      ['[테스트] 종료됨', userId]
    );
    promotionIds.closed = closed.rows[0].id;
  });

  afterAll(async () => {
    if (couponEventId) {
      await pool.query('DELETE FROM coupon_events WHERE id = $1', [couponEventId]);
    }
    const ids = Object.values(promotionIds).filter(Boolean);
    if (ids.length > 0) {
      await pool.query('DELETE FROM promotions WHERE id = ANY($1::int[])', [ids]);
    }
    await cleanupTestAccounts();
    await pool.end();
  });

  describe('GET /promotions', () => {
    test('published 프로모션 2건만 포함되고 draft/closed는 미포함된다 (BR-9, BR-10)', async () => {
      const res = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const returnedIds = res.body.map((p) => p.id);
      expect(returnedIds).toContain(promotionIds.publishedWithCoupon);
      expect(returnedIds).toContain(promotionIds.publishedNoCoupon);
      expect(returnedIds).not.toContain(promotionIds.draft);
      expect(returnedIds).not.toContain(promotionIds.closed);
    });

    test('published+coupon 항목의 coupon_event가 capacity/applied_count를 포함한다', async () => {
      const res = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${accessToken}`);

      const item = res.body.find((p) => p.id === promotionIds.publishedWithCoupon);
      expect(item).toBeTruthy();
      expect(item.coupon_event).toBeTruthy();
      expect(item.coupon_event.capacity).toBe(50);
      expect(item.coupon_event.applied_count).toBe(12);
      expect(item.coupon_event.promotion_id).toBe(promotionIds.publishedWithCoupon);
    });

    test('published without-coupon 항목의 coupon_event는 null이다', async () => {
      const res = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${accessToken}`);

      const item = res.body.find((p) => p.id === promotionIds.publishedNoCoupon);
      expect(item).toBeTruthy();
      expect(item.coupon_event).toBeNull();
    });

    test('토큰 없이 호출 시 401이 반환된다', async () => {
      const res = await request(app).get('/promotions');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /promotions/:id', () => {
    test('published+coupon 상세 조회 시 200과 정확한 중첩 객체를 반환한다', async () => {
      const res = await request(app)
        .get(`/promotions/${promotionIds.publishedWithCoupon}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(promotionIds.publishedWithCoupon);
      expect(res.body.status).toBe('published');
      expect(res.body.coupon_event).toEqual(
        expect.objectContaining({
          capacity: 50,
          applied_count: 12,
          promotion_id: promotionIds.publishedWithCoupon,
        })
      );
    });

    test('존재하지 않는 id 조회 시 404가 반환된다', async () => {
      const res = await request(app)
        .get('/promotions/999999999')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    test('비숫자 id 조회 시 500이 아닌 404가 반환된다', async () => {
      const res = await request(app)
        .get('/promotions/abc')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    test('토큰 없이 호출 시 401이 반환된다', async () => {
      const res = await request(app).get(`/promotions/${promotionIds.publishedWithCoupon}`);
      expect(res.status).toBe(401);
    });

    test('draft 프로모션도 상세 조회로는 200이 반환된다 (정책 고정)', async () => {
      const res = await request(app)
        .get(`/promotions/${promotionIds.draft}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(promotionIds.draft);
      expect(res.body.status).toBe('draft');
    });

    test('closed 프로모션도 상세 조회로는 200이 반환되지만 목록에는 없다 (BR-10)', async () => {
      const detailRes = await request(app)
        .get(`/promotions/${promotionIds.closed}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(promotionIds.closed);
      expect(detailRes.body.status).toBe('closed');

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${accessToken}`);

      const returnedIds = listRes.body.map((p) => p.id);
      expect(returnedIds).not.toContain(promotionIds.closed);
    });
  });
});
