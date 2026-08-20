const pool = require('./pool');

// BR-4: 5%=40%, 10%=30%, 15%=20%, 20%=10%. 순수함수로 분리해 검증 스크립트에서도 재사용 가능.
function drawDiscountRate() {
  const r = Math.random();
  if (r < 0.4) return 5;
  if (r < 0.7) return 10;
  if (r < 0.9) return 15;
  return 20;
}

// BR-5: 재신청 시 같은 application_id 행을 덮어쓴다(upsert), 새 행 생성 금지.
function upsertDrawResult(client, { applicationId, discountRate }) {
  return client.query(
    `INSERT INTO draw_results (application_id, discount_rate, confirmed_at)
     VALUES ($1, $2, now())
     ON CONFLICT (application_id) DO UPDATE
       SET discount_rate = EXCLUDED.discount_rate, confirmed_at = EXCLUDED.confirmed_at
     RETURNING *`,
    [applicationId, discountRate]
  );
}

function findByApplicationId(applicationId) {
  return pool.query('SELECT * FROM draw_results WHERE application_id = $1', [applicationId]);
}

module.exports = { drawDiscountRate, upsertDrawResult, findByApplicationId };
