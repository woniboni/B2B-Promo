// BE-5: 참여신청 API + 쿠폰 추첨 (UC-3/UC-4) 검증 — 프로젝트에서 가장 까다로운 작업
// 관련 문서: docs/1-domain-definition.md BR-3~8/BR-11/EX-1~4, docs/9-plan.md BE-5 완료조건, docs/swagger.json
//
// ponytail: 구현(src/controllers/applications.controller.js, src/db/applications.queries.js,
// src/db/drawResults.queries.js)이 아직 반영되지 않았다면 이 파일의 테스트는 지금 실패한다 —
// 병렬 구현 완료(nodemon 재시작) 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');

const EMAIL_PREFIX = 'test-be5-';
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

async function couponEventOf(promotionId) {
  const { rows } = await pool.query('SELECT * FROM coupon_events WHERE promotion_id = $1', [promotionId]);
  return rows[0];
}

describe('BE-5 참여신청 API + 쿠폰 추첨 (UC-3/UC-4)', () => {
  let adminToken;
  const createdPromotionIds = []; // 정리 대상 (admin API로 생성한 프로모션)

  // 시나리오별 거래처 담당자 계정 (Partner 1:1이므로 신청자마다 별도 계정 필요)
  const partners = {}; // tag -> { token, userId }

  async function createPartner(tag) {
    const email = uniqueEmail(tag);
    const signupRes = await request(app).post('/auth/signup').send({
      email,
      password: PASSWORD,
      name: `테스트담당자-${tag}`,
      phone: '010-0000-0000',
      partner_name: `테스트거래처-be5-${tag}`,
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

  beforeAll(async () => {
    await cleanupTestAccounts();

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.access_token;

    await Promise.all(
      [
        'general', // 조건1,2,3: 쿠폰 없는 일반 프로모션 신청/중복/재신청
        'couponA', // 조건4,5: 쿠폰 이벤트 신청 성공 + draw_result 응답
        'couponB', // 조건6: 취소 후 재신청 시 draw_results 덮어쓰기
        'couponC', // 조건7,8: applied_count 증가/취소 시 미감소
        'capA', // 조건9,10: 정원 49→50 성공 + 취소 후 재신청 시도(마감으로 거부)
        'capB', // 조건9,10: 정원 50 도달 후 신규 신청 거부
        'closedOwner', // 조건12: 종료된 프로모션의 기존 신청 취소 허용
        'closedNew', // 조건11: 종료된 프로모션 신규 신청 거부
        'ownershipOwner', // 조건13: 신청 소유자
        'ownershipOther', // 조건13: 타 거래처 취소 시도
      ].map(createPartner)
    );
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

  describe('일반 프로모션(쿠폰 없음) 신청/중복/재신청 (조건 1,2,3 — UC-3, BR-3, EX-2)', () => {
    let promotionId;
    let firstApplicationId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] 일반프로모션' });
    });

    test('신청 성공 시 applications 행이 status=applied로 생성된다 (조건1, UC-3)', async () => {
      const res = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.general.token}`);

      expect(res.status).toBe(201);
      expect(res.body.application.status).toBe('applied');
      expect(res.body.application.promotion_id).toBe(promotionId);
      expect(res.body.draw_result).toBeNull();
      firstApplicationId = res.body.application.id;

      const dbRow = await pool.query('SELECT * FROM applications WHERE id = $1', [firstApplicationId]);
      expect(dbRow.rows[0].status).toBe('applied');
    });

    test('이미 신청한 프로모션 재신청 시 409로 거부되고 새 행이 생성되지 않는다 (조건2, EX-2)', async () => {
      const res = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.general.token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('이미 신청한 프로모션입니다.');

      const dbRows = await pool.query('SELECT * FROM applications WHERE promotion_id = $1', [promotionId]);
      expect(dbRows.rows.length).toBe(1);
    });

    test('취소 후 재신청 시 새 행이 아니라 기존 행의 status가 canceled→applied로 전환된다 (조건3, BR-3)', async () => {
      const cancelRes = await request(app)
        .patch(`/applications/${firstApplicationId}/cancel`)
        .set('Authorization', `Bearer ${partners.general.token}`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('canceled');
      expect(cancelRes.body.canceled_at).toBeTruthy();

      const reapplyRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.general.token}`);
      expect(reapplyRes.status).toBe(201);
      expect(reapplyRes.body.application.status).toBe('applied');
      expect(reapplyRes.body.application.id).toBe(firstApplicationId);

      const dbRows = await pool.query('SELECT * FROM applications WHERE promotion_id = $1', [promotionId]);
      expect(dbRows.rows.length).toBe(1);
      expect(dbRows.rows[0].id).toBe(firstApplicationId);
      expect(dbRows.rows[0].status).toBe('applied');
    });
  });

  describe('쿠폰 이벤트 프로모션 신청 성공 시 추첨 (조건 4,5 — BR-4, BR-8)', () => {
    let promotionId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] 쿠폰이벤트-추첨', couponEvent: true });
    });

    test('신청 성공 시 draw_results 행이 생성되고 discount_rate가 5/10/15/20 중 하나이며, 응답에 할인율과 만료일이 포함된다', async () => {
      const res = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.couponA.token}`);

      expect(res.status).toBe(201);
      expect(res.body.draw_result).toBeTruthy();
      const discountRate = Number(res.body.draw_result.discount_rate);
      expect([5, 10, 15, 20]).toContain(discountRate);
      expect(res.body.draw_result.expires_at).toBeTruthy();
      expect(res.body.draw_result.confirmed_at).toBeTruthy();

      // BR-8: expires_at = confirmed_at + 1개월
      const confirmedAt = new Date(res.body.draw_result.confirmed_at);
      const expiresAt = new Date(res.body.draw_result.expires_at);
      const expectedExpiry = new Date(confirmedAt);
      expectedExpiry.setMonth(expectedExpiry.getMonth() + 1);
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(60 * 1000);

      const dbRow = await pool.query('SELECT * FROM draw_results WHERE application_id = $1', [
        res.body.application.id,
      ]);
      expect(dbRow.rows.length).toBe(1);
      expect([5, 10, 15, 20]).toContain(Number(dbRow.rows[0].discount_rate));
    });
  });

  describe('취소 후 재신청 시 draw_results 덮어쓰기 (조건6 — BR-5)', () => {
    let promotionId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] 쿠폰이벤트-재추첨덮어쓰기', couponEvent: true });
    });

    test('재신청 시 같은 application_id의 draw_results가 덮어써지고 행이 2개로 늘지 않는다', async () => {
      const firstRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.couponB.token}`);
      expect(firstRes.status).toBe(201);
      const applicationId = firstRes.body.application.id;

      const cancelRes = await request(app)
        .patch(`/applications/${applicationId}/cancel`)
        .set('Authorization', `Bearer ${partners.couponB.token}`);
      expect(cancelRes.status).toBe(200);

      const secondRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.couponB.token}`);
      expect(secondRes.status).toBe(201);
      expect(secondRes.body.application.id).toBe(applicationId);
      expect(secondRes.body.draw_result).toBeTruthy();

      const dbRows = await pool.query('SELECT * FROM draw_results WHERE application_id = $1', [applicationId]);
      expect(dbRows.rows.length).toBe(1);
    });
  });

  describe('applied_count 증가/미감소 (조건 7,8 — BR-6)', () => {
    let promotionId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] applied_count추적', couponEvent: true });
    });

    test('신청 성공 시 applied_count가 1 증가하고, 취소해도 감소하지 않는다', async () => {
      const before = await couponEventOf(promotionId);

      const applyRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.couponC.token}`);
      expect(applyRes.status).toBe(201);

      const afterApply = await couponEventOf(promotionId);
      expect(afterApply.applied_count).toBe(before.applied_count + 1);

      const cancelRes = await request(app)
        .patch(`/applications/${applyRes.body.application.id}/cancel`)
        .set('Authorization', `Bearer ${partners.couponC.token}`);
      expect(cancelRes.status).toBe(200);

      const afterCancel = await couponEventOf(promotionId);
      expect(afterCancel.applied_count).toBe(afterApply.applied_count);
    });
  });

  describe('선착순 50명 마감 경계 (조건 9,10 — EX-1, EX-4, 트랜잭션 롤백)', () => {
    let promotionId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] 정원마감경계', couponEvent: true });
      // 결정적/빠른 테스트를 위해 49번 반복 신청 대신 applied_count를 직접 49로 세팅
      await pool.query('UPDATE coupon_events SET applied_count = 49 WHERE promotion_id = $1', [promotionId]);
    });

    test('49→50번째 신청은 성공한다 (경계값)', async () => {
      const res = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.capA.token}`);
      expect(res.status).toBe(201);
      expect(res.body.draw_result).toBeTruthy();

      const couponEvent = await couponEventOf(promotionId);
      expect(couponEvent.applied_count).toBe(50);
    });

    test('정원 50 도달 후 신규 신청은 "마감되었습니다"로 거부되고 DB에 흔적을 남기지 않는다 (조건9,10, EX-1)', async () => {
      const res = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.capB.token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('마감되었습니다.');

      const appRows = await pool.query(
        'SELECT * FROM applications WHERE promotion_id = $1 AND partner_id = (SELECT id FROM partners WHERE user_id = $2)',
        [promotionId, partners.capB.userId]
      );
      expect(appRows.rows.length).toBe(0);

      const couponEvent = await couponEventOf(promotionId);
      expect(couponEvent.applied_count).toBe(50); // 변동 없음(롤백)
    });

    test('정원 50 도달 후 취소했던 신청의 재신청도 "마감되었습니다"로 거부되고 상태가 바뀌지 않는다 (조건9, EX-4)', async () => {
      // capA의 신청을 취소(슬롯 미반환, applied_count는 50 유지)
      const capAAppRows = await pool.query(
        'SELECT * FROM applications WHERE promotion_id = $1 AND partner_id = (SELECT id FROM partners WHERE user_id = $2)',
        [promotionId, partners.capA.userId]
      );
      const capAApplicationId = capAAppRows.rows[0].id;

      const cancelRes = await request(app)
        .patch(`/applications/${capAApplicationId}/cancel`)
        .set('Authorization', `Bearer ${partners.capA.token}`);
      expect(cancelRes.status).toBe(200);

      const drawBefore = await pool.query('SELECT * FROM draw_results WHERE application_id = $1', [
        capAApplicationId,
      ]);

      const reapplyRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.capA.token}`);
      expect(reapplyRes.status).toBe(409);
      expect(reapplyRes.body.error).toBe('마감되었습니다.');

      const appAfter = await pool.query('SELECT * FROM applications WHERE id = $1', [capAApplicationId]);
      expect(appAfter.rows[0].status).toBe('canceled'); // 재활성화되지 않음(롤백)

      const drawAfter = await pool.query('SELECT * FROM draw_results WHERE application_id = $1', [
        capAApplicationId,
      ]);
      expect(drawAfter.rows[0].discount_rate).toEqual(drawBefore.rows[0].discount_rate); // 덮어써지지 않음(롤백)

      const couponEvent = await couponEventOf(promotionId);
      expect(couponEvent.applied_count).toBe(50); // 변동 없음
    });
  });

  describe('종료된(closed) 프로모션 신청/취소 (조건 11,12 — EX-3, BR-11)', () => {
    let promotionId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] 종료프로모션' });

      // 종료 전에 closedOwner가 미리 신청해둔다
      const applyRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.closedOwner.token}`);
      expect(applyRes.status).toBe(201);
      partners.closedOwner.applicationId = applyRes.body.application.id;

      const closeRes = await request(app)
        .patch(`/admin/promotions/${promotionId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });
      expect(closeRes.status).toBe(200);
    });

    test('종료된 프로모션에 신규 신청 시 409로 거부된다 (조건11, EX-3)', async () => {
      const res = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.closedNew.token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('종료된 프로모션에는 신청할 수 없습니다.');
    });

    test('종료된 프로모션의 기존 신청은 정상적으로 취소된다 (조건12, BR-11)', async () => {
      const res = await request(app)
        .patch(`/applications/${partners.closedOwner.applicationId}/cancel`)
        .set('Authorization', `Bearer ${partners.closedOwner.token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('canceled');
      expect(res.body.canceled_at).toBeTruthy();
    });
  });

  describe('신청건 소유권 검증 (조건13)', () => {
    let promotionId;
    let ownerApplicationId;

    beforeAll(async () => {
      promotionId = await createPromotion({ title: '[테스트] 소유권검증' });
      const applyRes = await request(app)
        .post(`/promotions/${promotionId}/apply`)
        .set('Authorization', `Bearer ${partners.ownershipOwner.token}`);
      expect(applyRes.status).toBe(201);
      ownerApplicationId = applyRes.body.application.id;
    });

    test('다른 거래처의 신청건을 취소하려 하면 403으로 거부된다', async () => {
      const res = await request(app)
        .patch(`/applications/${ownerApplicationId}/cancel`)
        .set('Authorization', `Bearer ${partners.ownershipOther.token}`);

      expect(res.status).toBe(403);

      const dbRow = await pool.query('SELECT * FROM applications WHERE id = $1', [ownerApplicationId]);
      expect(dbRow.rows[0].status).toBe('applied'); // 취소되지 않음
    });
  });

  describe('부가 케이스: 존재하지 않는 리소스 / 인증 없음', () => {
    test('존재하지 않는 프로모션에 신청 시 404가 반환된다', async () => {
      const res = await request(app)
        .post('/promotions/999999999/apply')
        .set('Authorization', `Bearer ${partners.general.token}`);
      expect(res.status).toBe(404);
    });

    test('토큰 없이 신청 호출 시 401이 반환된다', async () => {
      const res = await request(app).post('/promotions/1/apply');
      expect(res.status).toBe(401);
    });

    test('토큰 없이 취소 호출 시 401이 반환된다', async () => {
      const res = await request(app).patch('/applications/1/cancel');
      expect(res.status).toBe(401);
    });
  });
});
