// BE-2: 인증 API + JWT 미들웨어 (UC-1) 검증
// 관련 문서: docs/1-domain-definition.md BR-1/BR-2/EX-5, docs/9-plan.md BE-2 완료조건, docs/swagger.json
//
// ponytail: 구현(src/routes/auth.routes.js, src/middlewares/auth.js, src/db/users.queries.js)이
// 아직 없다면 이 파일의 테스트는 지금 모듈 로드 단계에서 실패한다 — 병렬 구현 완료 후 재실행 대상.
require('dotenv').config();
const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const app = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const pool = require('../src/db/pool');
const authMiddleware = require('../src/middlewares/auth');

const EMAIL_PREFIX = 'test-auth-';

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

// 실제 app.js에 인증이 걸린 라우트가 없을 수 있으므로, authMiddleware 자체를 직접
// 장착한 미니 앱으로 보호 라우트 동작(401/통과)을 검증한다.
function buildProtectedApp() {
  const protectedApp = express();
  protectedApp.use(express.json());
  protectedApp.get('/protected', authMiddleware, (req, res) => {
    res.status(200).json({ ok: true });
  });
  // eslint-disable-next-line no-unused-vars
  protectedApp.use((err, req, res, next) => {
    res.status(err.status || 401).json({ error: err.message || 'Unauthorized' });
  });
  return protectedApp;
}

async function cleanupTestAccounts() {
  await pool.query(
    `DELETE FROM partners WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`${EMAIL_PREFIX}%`]
  );
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
}

describe('BE-2 인증 API + JWT 미들웨어 (UC-1)', () => {
  beforeAll(async () => {
    await cleanupTestAccounts();
  });

  afterAll(async () => {
    await cleanupTestAccounts();
    await pool.end();
  });

  describe('POST /auth/signup', () => {
    test('성공 시 users 1행 + partners 1행이 생성되고, 응답에 password_hash가 없다', async () => {
      const email = uniqueEmail('signup-ok');

      const res = await request(app).post('/auth/signup').send(validSignupBody(email));

      expect(res.status).toBe(201);
      expect(res.body.user).toBeTruthy();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.password_hash).toBeUndefined();
      expect(res.body.partner).toBeTruthy();
      expect(res.body.partner.name).toBe('테스트거래처');

      const userRows = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      expect(userRows.rows.length).toBe(1);

      const partnerRows = await pool.query('SELECT * FROM partners WHERE user_id = $1', [
        userRows.rows[0].id,
      ]);
      expect(partnerRows.rows.length).toBe(1);
    });

    test('필수 필드(partner_name) 누락 시 4xx가 반환되고 행이 생성되지 않는다', async () => {
      const email = uniqueEmail('signup-missing');

      const res = await request(app).post('/auth/signup').send({
        email,
        password: PASSWORD,
        name: '홍길동',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const userRows = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      expect(userRows.rows.length).toBe(0);
    });

    test('비밀번호가 8자 미만이면 4xx가 반환되고 행이 생성되지 않는다', async () => {
      const email = uniqueEmail('signup-shortpw');

      const res = await request(app).post('/auth/signup').send({
        ...validSignupBody(email),
        password: 'short',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);

      const userRows = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      expect(userRows.rows.length).toBe(0);
    });

    test('중복 이메일 회원가입 시 409가 반환되고 계정이 추가 생성되지 않는다 (트랜잭션 롤백)', async () => {
      const email = uniqueEmail('signup-dup');

      const first = await request(app).post('/auth/signup').send(validSignupBody(email));
      expect(first.status).toBe(201);

      const beforeUsers = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [
        email,
      ]);
      const beforePartners = await pool.query(
        'SELECT COUNT(*)::int AS count FROM partners WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
        [email]
      );

      const second = await request(app).post('/auth/signup').send(validSignupBody(email));
      expect(second.status).toBe(409);
      expect(second.body).toHaveProperty('error');

      const afterUsers = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE email = $1', [
        email,
      ]);
      const afterPartners = await pool.query(
        'SELECT COUNT(*)::int AS count FROM partners WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
        [email]
      );

      expect(afterUsers.rows[0].count).toBe(beforeUsers.rows[0].count);
      expect(afterPartners.rows[0].count).toBe(beforePartners.rows[0].count);
      expect(afterUsers.rows[0].count).toBe(1);
      expect(afterPartners.rows[0].count).toBe(1);
    });
  });

  describe('POST /auth/login', () => {
    const email = uniqueEmail('login-ok');

    beforeAll(async () => {
      const res = await request(app).post('/auth/signup').send(validSignupBody(email));
      expect(res.status).toBe(201);
    });

    test('성공 시 access_token/refresh_token/user가 모두 응답에 포함된다', async () => {
      const res = await request(app).post('/auth/login').send({ email, password: PASSWORD });

      expect(res.status).toBe(200);
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body.access_token.length).toBeGreaterThan(0);
      expect(typeof res.body.refresh_token).toBe('string');
      expect(res.body.refresh_token.length).toBeGreaterThan(0);
      expect(res.body.user).toBeTruthy();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.password_hash).toBeUndefined();
    });

    test('잘못된 비밀번호로 로그인 시 401이 반환되고 토큰이 발급되지 않는다', async () => {
      const res = await request(app).post('/auth/login').send({ email, password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.access_token).toBeUndefined();
      expect(res.body.refresh_token).toBeUndefined();
    });

    test('존재하지 않는 이메일로 로그인 시 401이 반환된다', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: uniqueEmail('login-nonexistent'), password: PASSWORD });

      expect(res.status).toBe(401);
    });

    test('비밀번호 누락 시 4xx가 반환된다', async () => {
      const res = await request(app).post('/auth/login').send({ email });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('인증 미들웨어 (보호 라우트)', () => {
    const protectedApp = buildProtectedApp();

    test('토큰 없이 보호 라우트 호출 시 401이 반환된다', async () => {
      const res = await request(protectedApp).get('/protected');
      expect(res.status).toBe(401);
    });

    test('위조된(다른 시크릿으로 서명된) Access Token으로 호출 시 401이 반환된다', async () => {
      const forged = jwt.sign({ sub: 1, role: 'partner' }, 'this-is-not-the-real-secret', {
        expiresIn: '15m',
      });

      const res = await request(protectedApp)
        .get('/protected')
        .set('Authorization', `Bearer ${forged}`);

      expect(res.status).toBe(401);
    });

    test('만료된 Access Token으로 호출 시 401이 반환된다', async () => {
      // exp를 과거로 직접 지정해 만료된 토큰을 결정적으로 재현한다 (expiresIn 음수 문자열 파싱에 의존하지 않음)
      const expired = jwt.sign(
        { sub: 1, role: 'partner', exp: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_ACCESS_SECRET
      );

      const res = await request(protectedApp)
        .get('/protected')
        .set('Authorization', `Bearer ${expired}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    const email = uniqueEmail('refresh-ok');
    let refreshToken;

    beforeAll(async () => {
      const signupRes = await request(app).post('/auth/signup').send(validSignupBody(email));
      expect(signupRes.status).toBe(201);

      const loginRes = await request(app).post('/auth/login').send({ email, password: PASSWORD });
      expect(loginRes.status).toBe(200);
      refreshToken = loginRes.body.refresh_token;
    });

    test('유효한 refresh_token으로 새 access_token이 발급되고, 그 토큰으로 보호 라우트 호출이 성공한다', async () => {
      const res = await request(app).post('/auth/refresh').send({ refresh_token: refreshToken });

      expect(res.status).toBe(200);
      expect(typeof res.body.access_token).toBe('string');
      expect(res.body.access_token.length).toBeGreaterThan(0);

      const protectedApp = buildProtectedApp();
      const protectedRes = await request(protectedApp)
        .get('/protected')
        .set('Authorization', `Bearer ${res.body.access_token}`);

      expect(protectedRes.status).toBe(200);
    });

    test('유효하지 않은/위조된 refresh_token으로 요청 시 401이 반환된다', async () => {
      const forged = jwt.sign({ sub: 1 }, 'this-is-not-the-real-secret', { expiresIn: '30d' });

      const res = await request(app).post('/auth/refresh').send({ refresh_token: forged });

      expect(res.status).toBe(401);
    });

    test('refresh_token 누락 시 401이 반환된다', async () => {
      const res = await request(app).post('/auth/refresh').send({});

      expect(res.status).toBe(401);
    });
  });

  describe('보안: 비밀번호 저장 방식', () => {
    test('DB에 저장된 password_hash가 평문이 아니라 bcrypt 형식($2로 시작)이다', async () => {
      const email = uniqueEmail('hash-check');

      await request(app).post('/auth/signup').send(validSignupBody(email));

      const rows = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].password_hash).not.toBe(PASSWORD);
      expect(rows.rows[0].password_hash.startsWith('$2')).toBe(true);
    });
  });
});
