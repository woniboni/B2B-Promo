const pool = require('./pool');

const SELECT_BASE = `
  SELECT
    p.*,
    ce.id AS ce_id,
    ce.promotion_id AS ce_promotion_id,
    ce.capacity AS ce_capacity,
    ce.applied_count AS ce_applied_count,
    ce.created_at AS ce_created_at
  FROM promotions p
  LEFT JOIN coupon_events ce ON ce.promotion_id = p.id
`;

// row의 ce_* 컬럼을 coupon_event 객체로 묶는다. coupon_events가 없으면(LEFT JOIN 미스) null.
function mapRow(row) {
  const { ce_id, ce_promotion_id, ce_capacity, ce_applied_count, ce_created_at, ...promotion } = row;
  return {
    ...promotion,
    coupon_event:
      ce_id == null
        ? null
        : {
            id: ce_id,
            promotion_id: ce_promotion_id,
            capacity: ce_capacity,
            applied_count: ce_applied_count,
            created_at: ce_created_at,
          },
  };
}

// BR-9/BR-10: 게시된 프로모션만 목록에 노출한다(임시저장/종료 제외).
async function listPublished() {
  const { rows } = await pool.query(`${SELECT_BASE} WHERE p.status = 'published' ORDER BY p.created_at DESC`);
  return rows.map(mapRow);
}

async function findById(id) {
  const { rows } = await pool.query(`${SELECT_BASE} WHERE p.id = $1`, [id]);
  return rows[0] && mapRow(rows[0]);
}

// admin용: 상태 무관 전체 목록
async function listAll() {
  const { rows } = await pool.query(`${SELECT_BASE} ORDER BY p.created_at DESC`);
  return rows.map(mapRow);
}

function insertPromotion(client, { title, type, description, status, createdBy }) {
  return client.query(
    'INSERT INTO promotions (title, type, description, status, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [title, type, description, status, createdBy]
  );
}

function updatePromotion(id, { title, type, description }) {
  return pool.query(
    'UPDATE promotions SET title=COALESCE($2,title), type=COALESCE($3,type), description=COALESCE($4,description), updated_at=now() WHERE id=$1 RETURNING id',
    [id, title, type, description]
  );
}

function updateStatus(id, status) {
  return pool.query('UPDATE promotions SET status=$2, updated_at=now() WHERE id=$1 RETURNING id', [id, status]);
}

module.exports = { listPublished, findById, mapRow, listAll, insertPromotion, updatePromotion, updateStatus };
