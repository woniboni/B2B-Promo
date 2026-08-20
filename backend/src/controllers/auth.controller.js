const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { findByEmail, insertUser, insertPartner } = require('../db/users.queries');

// 만료 시간은 .env(JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN)로 설정 가능(docs/3-prd.md 6.3절 근거).
// 미설정 시 기본값 Access 15분 / Refresh 7일을 사용한다.
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_COST_FACTOR = 10;

function signAccessToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

function signRefreshToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

async function signup(req, res, next) {
  const { email, password, name, phone, partner_name: partnerName } = req.body || {};

  if (!email || !password || !name || !partnerName) {
    return next(Object.assign(new Error('필수 항목이 누락되었습니다.'), { status: 400 }));
  }
  if (password.length < 8) {
    return next(Object.assign(new Error('비밀번호는 8자 이상이어야 합니다.'), { status: 400 }));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const { rows: userRows } = await insertUser(client, { email, passwordHash, name, phone });
    const user = userRows[0];
    const { rows: partnerRows } = await insertPartner(client, { name: partnerName, userId: user.id });
    await client.query('COMMIT');

    res.status(201).json({ user, partner: partnerRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return next(Object.assign(new Error('이미 가입된 이메일입니다.'), { status: 409 }));
    }
    next(err);
  } finally {
    client.release();
  }
}

async function login(req, res, next) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return next(Object.assign(new Error('필수 항목이 누락되었습니다.'), { status: 400 }));
  }

  try {
    const { rows } = await findByEmail(email);
    const user = rows[0];
    // ponytail: 계정 존재 여부를 노출하지 않도록 미존재/불일치 모두 동일 메시지로 401 처리.
    const invalidCredentials = Object.assign(
      new Error('이메일 또는 비밀번호가 올바르지 않습니다.'),
      { status: 401 }
    );
    if (!user) {
      return next(invalidCredentials);
    }
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return next(invalidCredentials);
    }

    const { password_hash: _passwordHash, ...safeUser } = user;
    res.status(200).json({
      access_token: signAccessToken(user),
      refresh_token: signRefreshToken(user),
      user: safeUser,
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  const { refresh_token: refreshToken } = req.body || {};

  const invalidRefreshToken = Object.assign(
    new Error('유효하지 않은 Refresh Token입니다. 다시 로그인해주세요.'),
    { status: 401 }
  );

  if (!refreshToken) {
    return next(invalidRefreshToken);
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    // ponytail: stateless 검증만 수행한다(revocation/블랙리스트 미지원, docs 6.3절 근거).
    const accessToken = signAccessToken({ id: payload.id, role: payload.role });
    res.status(200).json({ access_token: accessToken });
  } catch (err) {
    next(invalidRefreshToken);
  }
}

module.exports = { signup, login, refresh };
