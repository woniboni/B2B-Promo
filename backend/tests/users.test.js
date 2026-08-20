// BE-8: 마이페이지 API (UC-9) 검증
// 관련 문서: docs/9-plan.md BE-8 완료조건, docs/swagger.json (/users/me, /users/me/password)
//
// ponytail: 구현(src/controllers/users.controller.js, src/routes/users.routes.js)이
// 아직 없다면 이 파일의 테스트는 지금 실패한다 — 병렬 구현 완료 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');

const EMAIL_PREFIX = 'test-users-';

function uniqueEmail(tag) {
  return `${EMAIL_PREFIX}${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const PASSWORD = 'password123';

function validSignupBody(email) {
  return {
    email,
    password: PASSWORD,
    name: '홍길동',
    phone: '010-1234-5678',
    partner_name: '테스트거래처',
  };
}

async function cleanupTestAccounts() {
  await pool.query(
    `DELETE FROM partners WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
}

async function signupAndLogin(email) {
  const signupRes = await request(app).post('/auth/signup').send(validSignupBody(email));
  expect(signupRes.status).toBe(201);

  const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  expect(loginRes.status).toBe(200);
  return loginRes.body.access_token;
}

describe('BE-8 마이페이지 API (UC-9)', () => {
  beforeAll(async () => {
    await cleanupTestAccounts();
  });

  afterAll(async () => {
    await cleanupTestAccounts();
    await pool.end();
  });

  describe('GET /users/me', () => {
    const email = uniqueEmail('get-ok');
    let token;

    beforeAll(async () => {
      token = await signupAndLogin(email);
    });

    test('로그인 사용자 정보를 반환하고 password_hash는 응답에 없다', async () => {
      const res = await request(app).get('/users/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(email);
      expect(res.body.name).toBe('홍길동');
      expect(res.body.phone).toBe('010-1234-5678');
      expect(res.body.role).toBe('partner');
      expect(res.body.password_hash).toBeUndefined();
    });

    test('토큰 없이 호출 시 401이 반환된다', async () => {
      const res = await request(app).get('/users/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /users/me', () => {
    const email = uniqueEmail('patch-ok');
    let token;

    beforeAll(async () => {
      token = await signupAndLogin(email);
    });

    test('이름/전화번호가 갱신되고 응답 및 DB에 반영된다', async () => {
      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '김철수', phone: '010-9999-8888' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('김철수');
      expect(res.body.phone).toBe('010-9999-8888');
      expect(res.body.password_hash).toBeUndefined();

      const rows = await pool.query('SELECT name, phone FROM users WHERE email = $1', [email]);
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].name).toBe('김철수');
      expect(rows.rows[0].phone).toBe('010-9999-8888');
    });

    test('토큰 없이 호출 시 401이 반환된다', async () => {
      const res = await request(app).patch('/users/me').send({ name: '아무개' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /users/me/password', () => {
    test('현재 비밀번호가 틀리면 400이 반환되고 비밀번호가 변경되지 않는다', async () => {
      const email = uniqueEmail('pw-wrong');
      const token = await signupAndLogin(email);

      const before = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);

      const res = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: 'wrong-current-password', new_password: 'newpassword123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('현재 비밀번호가 올바르지 않습니다.');

      const after = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
      expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    });

    test('새 비밀번호가 8자 미만이면 4xx가 반환된다', async () => {
      const email = uniqueEmail('pw-short');
      const token = await signupAndLogin(email);

      const res = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: PASSWORD, new_password: 'short' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('올바른 현재 비밀번호로 변경 성공 후, 이전 비밀번호로는 로그인 실패(401)하고 새 비밀번호로는 로그인 성공(200)한다', async () => {
      const email = uniqueEmail('pw-ok');
      const token = await signupAndLogin(email);
      const NEW_PASSWORD = 'newpassword123';

      const res = await request(app)
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: PASSWORD, new_password: NEW_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('비밀번호가 변경되었습니다.');

      const oldLogin = await request(app).post('/auth/login').send({ email, password: PASSWORD });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/auth/login')
        .send({ email, password: NEW_PASSWORD });
      expect(newLogin.status).toBe(200);
      expect(typeof newLogin.body.access_token).toBe('string');
    });

    test('토큰 없이 호출 시 401이 반환된다', async () => {
      const res = await request(app)
        .patch('/users/me/password')
        .send({ current_password: PASSWORD, new_password: 'newpassword123' });
      expect(res.status).toBe(401);
    });
  });
});
