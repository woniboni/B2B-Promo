// BE-4: 관리자 프로모션 관리 API (UC-6/UC-7) 검증
// 관련 문서: docs/1-domain-definition.md BR-6/BR-9/BR-10, docs/9-plan.md BE-4 완료조건, docs/swagger.json
//
// ponytail: 구현(src/routes/promotions.routes.js의 /admin/promotions*, src/controllers/promotions.controller.js
// 관리자 핸들러)이 아직 병합되지 않았다면 이 파일의 테스트는 지금 실패한다 — 병렬 구현 완료(nodemon 재시작) 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');
const { insertCouponEvent } = require('../src/db/couponEvents.queries');

const EMAIL_PREFIX = 'test-adminpromo-';
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

describe('BE-4 관리자 프로모션 관리 API (UC-6/UC-7)', () => {
  let adminToken;
  let adminUserId;
  let partnerToken;
  const createdPromotionIds = []; // POST /admin/promotions로 생성된 프로모션(정리 대상)
  let fixturePromotionId; // 인가(401/403) 테스트용, 직접 INSERT

  beforeAll(async () => {
    await cleanupTestAccounts();

    // 관리자 로그인 (DB-2 시딩 계정, 절대 생성/삭제하지 않음)
    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.access_token;
    adminUserId = adminLogin.body.user.id;

    // 거래처 담당자 계정
    const email = uniqueEmail('partner');
    const signupRes = await request(app).post('/auth/signup').send({
      email,
      password: PASSWORD,
      name: '테스트담당자',
      phone: '010-3333-4444',
      partner_name: '테스트거래처-adminpromo',
    });
    expect(signupRes.status).toBe(201);

    const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    partnerToken = loginRes.body.access_token;

    // 인가 테스트용 fixture (draft 상태, 관리자 API를 거치지 않고 직접 INSERT)
    const fixture = await pool.query(
      `INSERT INTO promotions (title, type, description, status, created_by)
       VALUES ('[테스트] 인가확인용', 'price_discount', '설명', 'draft', $1) RETURNING id`,
      [adminUserId]
    );
    fixturePromotionId = fixture.rows[0].id;
  });

  afterAll(async () => {
    const allIds = [...createdPromotionIds, fixturePromotionId].filter(Boolean);
    if (allIds.length > 0) {
      await pool.query('DELETE FROM coupon_events WHERE promotion_id = ANY($1::int[])', [allIds]);
      await pool.query('DELETE FROM promotions WHERE id = ANY($1::int[])', [allIds]);
    }
    await cleanupTestAccounts();
    await pool.end();
  });

  describe('인가: 토큰 없음(401) / 거래처 담당자 토큰(403)', () => {
    const endpoints = () => [
      { method: 'get', url: '/admin/promotions' },
      { method: 'post', url: '/admin/promotions', body: { title: 't', type: 'sample' } },
      { method: 'put', url: `/admin/promotions/${fixturePromotionId}`, body: { title: 't2' } },
      {
        method: 'patch',
        url: `/admin/promotions/${fixturePromotionId}/status`,
        body: { status: 'published' },
      },
    ];

    test('토큰 없이 호출 시 4개 엔드포인트 모두 401이 반환된다', async () => {
      for (const ep of endpoints()) {
        const res = await request(app)[ep.method](ep.url).send(ep.body);
        expect(res.status).toBe(401);
      }
    });

    test('거래처 담당자 토큰으로 호출 시 4개 엔드포인트 모두 403이 반환된다', async () => {
      for (const ep of endpoints()) {
        const res = await request(app)
          [ep.method](ep.url)
          .set('Authorization', `Bearer ${partnerToken}`)
          .send(ep.body);
        expect(res.status).toBe(403);
      }
    });
  });

  describe('POST /admin/promotions', () => {
    test('draft로 등록 가능하고, GET /promotions(거래처용)에는 노출되지 않는다 (UC-6)', async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 임시저장건', type: 'sample', description: '설명' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      createdPromotionIds.push(res.body.id);

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.map((p) => p.id)).not.toContain(res.body.id);
    });

    test('coupon_event:true로 등록하면 coupon_events 행이 capacity=50/applied_count=0으로 생성된다 (BR-6)', async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: '[테스트] 쿠폰이벤트건',
          type: 'price_discount',
          status: 'draft',
          coupon_event: true,
        });

      expect(res.status).toBe(201);
      createdPromotionIds.push(res.body.id);

      expect(res.body.coupon_event).toBeTruthy();
      expect(res.body.coupon_event.capacity).toBe(50);
      expect(res.body.coupon_event.applied_count).toBe(0);

      const dbRow = await pool.query('SELECT * FROM coupon_events WHERE promotion_id = $1', [res.body.id]);
      expect(dbRow.rows.length).toBe(1);
      expect(dbRow.rows[0].capacity).toBe(50);
      expect(dbRow.rows[0].applied_count).toBe(0);
    });

    test('title 누락 시 400이 반환된다', async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'sample' });
      expect(res.status).toBe(400);
    });

    test('type 누락 시 400이 반환된다', async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 유형없음' });
      expect(res.status).toBe(400);
    });

    test('type이 enum 밖의 값이면 400이 반환된다', async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 잘못된유형', type: 'not_a_valid_type' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /admin/promotions/:id', () => {
    let targetId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 수정전', type: 'sample', description: '수정전설명' });
      expect(res.status).toBe(201);
      targetId = res.body.id;
      createdPromotionIds.push(targetId);
    });

    test('제목/유형/설명 수정 시 200과 수정된 값이 반환된다', async () => {
      const res = await request(app)
        .put(`/admin/promotions/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 수정후', type: 'bogo', description: '수정후설명' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('[테스트] 수정후');
      expect(res.body.type).toBe('bogo');
      expect(res.body.description).toBe('수정후설명');
    });

    test('존재하지 않는 id 수정 시 404가 반환된다', async () => {
      const res = await request(app)
        .put('/admin/promotions/999999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '없음' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /admin/promotions/:id/status', () => {
    let targetId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 상태전환대상', type: 'tasting' });
      expect(res.status).toBe(201);
      targetId = res.body.id;
      createdPromotionIds.push(targetId);
    });

    test('published로 전환 시 200이 반환되고 즉시 GET /promotions에 노출된다 (BR-9)', async () => {
      const patchRes = await request(app)
        .patch(`/admin/promotions/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.status).toBe('published');

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(listRes.body.map((p) => p.id)).toContain(targetId);
    });

    test('closed로 전환 시 200이 반환되고 GET /promotions에서 제외된다 (BR-10)', async () => {
      const patchRes = await request(app)
        .patch(`/admin/promotions/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.status).toBe('closed');

      const listRes = await request(app)
        .get('/promotions')
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(listRes.body.map((p) => p.id)).not.toContain(targetId);
    });

    test('유효하지 않은 status 값("draft") 전달 시 400이 반환된다', async () => {
      const res = await request(app)
        .patch(`/admin/promotions/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'draft' });
      expect(res.status).toBe(400);
    });

    test('유효하지 않은 status 값(오타) 전달 시 400이 반환된다', async () => {
      const res = await request(app)
        .patch(`/admin/promotions/${targetId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'publishedd' });
      expect(res.status).toBe(400);
    });

    test('존재하지 않는 id 상태전환 시 404가 반환된다', async () => {
      const res = await request(app)
        .patch('/admin/promotions/999999999/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /admin/promotions', () => {
    test('draft/published/closed 프로모션을 모두 반환한다', async () => {
      const draft = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 전체목록-draft', type: 'sample', status: 'draft' });
      expect(draft.status).toBe(201);
      createdPromotionIds.push(draft.body.id);

      const publishedSeed = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 전체목록-published', type: 'sample', status: 'published' });
      expect(publishedSeed.status).toBe(201);
      createdPromotionIds.push(publishedSeed.body.id);

      const closedSeed = await request(app)
        .post('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: '[테스트] 전체목록-closed', type: 'sample', status: 'draft' });
      expect(closedSeed.status).toBe(201);
      createdPromotionIds.push(closedSeed.body.id);
      const closeRes = await request(app)
        .patch(`/admin/promotions/${closedSeed.body.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' });
      expect(closeRes.status).toBe(200);
      const closeRes2 = await request(app)
        .patch(`/admin/promotions/${closedSeed.body.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });
      expect(closeRes2.status).toBe(200);

      const listRes = await request(app)
        .get('/admin/promotions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      const returnedIds = listRes.body.map((p) => p.id);
      expect(returnedIds).toContain(draft.body.id);
      expect(returnedIds).toContain(publishedSeed.body.id);
      expect(returnedIds).toContain(closedSeed.body.id);
    });
  });

  describe('쿠폰 이벤트 1:0..1 제약 (UNIQUE, BR-6)', () => {
    test('동일 프로모션에 쿠폰 이벤트를 2개 부착하면 두 번째 호출이 23505로 거부된다', async () => {
      const promo = await pool.query(
        `INSERT INTO promotions (title, type, status, created_by)
         VALUES ('[테스트] 쿠폰중복', 'sample', 'draft', $1) RETURNING id`,
        [adminUserId]
      );
      const promotionId = promo.rows[0].id;
      createdPromotionIds.push(promotionId);

      const first = await insertCouponEvent(pool, promotionId);
      expect(first.rows.length).toBe(1);
      expect(first.rows[0].capacity).toBe(50);
      expect(first.rows[0].applied_count).toBe(0);

      await expect(insertCouponEvent(pool, promotionId)).rejects.toMatchObject({ code: '23505' });
    });
  });
});
