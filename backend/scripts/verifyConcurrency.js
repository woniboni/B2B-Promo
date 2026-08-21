// QA-1: 선착순 50명 동시성 재현 검증 (BR-6, BR-7) — docs/9-plan.md
// 전제: 백엔드 dev 서버가 이미 기동되어 있어야 한다 (npm run dev, 기본 http://localhost:3000)
// 실행: node backend/scripts/verifyConcurrency.js
require('dotenv').config({ path: __dirname + '/../.env' });
const pool = require('../src/db/pool');

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@b2b-promo.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const APPLICANTS = 100;
const RUN_ID = Date.now();
const EMAIL_PATTERN = `test-qa1-${RUN_ID}-%`;

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function createPartner(i) {
  const email = `test-qa1-${RUN_ID}-${i}@example.com`;
  const signupRes = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: 'Passw0rd!',
      name: `QA1 신청자 ${i}`,
      phone: '010-0000-0000',
      partner_name: `QA1 거래처 ${i}`,
    }),
  });
  if (signupRes.status !== 201) {
    throw new Error(`파트너 ${i} 회원가입 실패: ${signupRes.status} ${JSON.stringify(signupRes.body)}`);
  }
  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'Passw0rd!' }),
  });
  if (loginRes.status !== 200) {
    throw new Error(`파트너 ${i} 로그인 실패: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }
  return loginRes.body.access_token;
}

async function cleanup(promotionId) {
  await pool.query(
    `DELETE FROM draw_results WHERE application_id IN (SELECT id FROM applications WHERE promotion_id = $1)`,
    [promotionId]
  );
  await pool.query(`DELETE FROM applications WHERE promotion_id = $1`, [promotionId]);
  await pool.query(`DELETE FROM coupon_events WHERE promotion_id = $1`, [promotionId]);
  await pool.query(`DELETE FROM promotions WHERE id = $1`, [promotionId]);
  await pool.query(
    `DELETE FROM partners WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [EMAIL_PATTERN]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [EMAIL_PATTERN]);
}

async function main() {
  let promotionId = null;
  try {
    const adminLogin = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (adminLogin.status !== 200) {
      throw new Error(`관리자 로그인 실패: ${adminLogin.status} ${JSON.stringify(adminLogin.body)} (ADMIN_EMAIL/ADMIN_PASSWORD 환경변수 확인)`);
    }
    const adminToken = adminLogin.body.access_token;

    const createRes = await api('/admin/promotions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: `QA-1 동시성 검증용 프로모션 ${RUN_ID}`,
        type: 'bogo',
        description: 'QA-1 자동 검증 스크립트가 생성/삭제하는 임시 프로모션',
        status: 'published',
        coupon_event: true,
      }),
    });
    if (createRes.status !== 201) {
      throw new Error(`프로모션 생성 실패: ${createRes.status} ${JSON.stringify(createRes.body)}`);
    }
    promotionId = createRes.body.id;
    console.log(`프로모션 생성 완료: id=${promotionId}, capacity=${createRes.body.coupon_event.capacity}`);

    console.log(`${APPLICANTS}개 파트너 계정 생성 중...`);
    const tokens = [];
    for (let i = 0; i < APPLICANTS; i++) tokens.push(await createPartner(i));
    console.log('파트너 계정 준비 완료. 동시 신청 발사...');

    const results = await Promise.all(
      tokens.map((token) =>
        api(`/promotions/${promotionId}/apply`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        })
      )
    );

    const succeeded = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 409).length;
    const unexpected = results.filter((r) => r.status !== 201 && r.status !== 409);

    console.log(`성공(201): ${succeeded}건`);
    console.log(`거부(409): ${rejected}건`);
    if (unexpected.length > 0) {
      console.log(`예상 밖 응답: ${unexpected.length}건`, unexpected.slice(0, 3));
    }

    const { rows: couponRows } = await pool.query(
      'SELECT applied_count, capacity FROM coupon_events WHERE promotion_id = $1',
      [promotionId]
    );
    const { applied_count: appliedCount, capacity } = couponRows[0];
    const { rows: appCountRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM applications WHERE promotion_id = $1',
      [promotionId]
    );
    const applicationRowCount = appCountRows[0].count;

    console.log(`DB coupon_events.applied_count=${appliedCount} (capacity=${capacity})`);
    console.log(`DB applications 행 수=${applicationRowCount}`);

    const checks = [
      ['정확히 50건 성공', succeeded === 50],
      ['나머지는 마감(409)으로 거부', rejected === APPLICANTS - 50],
      ['예상 밖 응답 없음', unexpected.length === 0],
      ['applied_count가 50(50 초과 없음)', Number(appliedCount) === 50],
      ['성공 건수와 applications 행 수 일치', applicationRowCount === succeeded],
    ];
    checks.forEach(([label, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}`));

    const pass = checks.every(([, ok]) => ok);
    console.log(pass ? '\n[QA-1] PASS' : '\n[QA-1] FAIL');
    process.exitCode = pass ? 0 : 1;
  } catch (err) {
    console.error('[QA-1] 실행 중 에러:', err.message, err.cause || '');
    process.exitCode = 1;
  } finally {
    if (promotionId) await cleanup(promotionId);
    await pool.end();
  }
}

main();
