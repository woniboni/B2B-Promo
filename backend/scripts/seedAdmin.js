// DB-2: 관리자 계정 시딩 (docs/9-plan.md, BR-2 — 관리자는 앱 내 회원가입 기능이 없다)
// 실행: node backend/scripts/seedAdmin.js
require('dotenv').config({ path: __dirname + '/../.env' });
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@b2b-promo.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const ADMIN_NAME = process.env.ADMIN_NAME || '관리자';

async function main() {
  const client = new Client({ connectionString: process.env.DB_CONN_STRING });
  await client.connect();

  try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const result = await client.query(
      `INSERT INTO users (email, password_hash, role, name)
       VALUES ($1, $2, 'admin', $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [ADMIN_EMAIL, passwordHash, ADMIN_NAME]
    );

    if (result.rowCount === 0) {
      console.log(`이미 존재하는 관리자 계정입니다 (${ADMIN_EMAIL}). 건너뜁니다.`);
    } else {
      console.log(`관리자 계정 생성 완료: ${ADMIN_EMAIL} (id=${result.rows[0].id})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('관리자 계정 시딩 실패:', err.message);
  process.exit(1);
});
