const pool = require('./pool');

function findByPromotionAndPartner(client, promotionId, partnerId) {
  return client.query('SELECT * FROM applications WHERE promotion_id = $1 AND partner_id = $2', [
    promotionId,
    partnerId,
  ]);
}

function insertApplication(client, { promotionId, partnerId }) {
  return client.query(
    'INSERT INTO applications (promotion_id, partner_id) VALUES ($1, $2) RETURNING *',
    [promotionId, partnerId]
  );
}

function reactivateApplication(client, id) {
  return client.query(
    `UPDATE applications SET status = 'applied', applied_at = now(), canceled_at = NULL WHERE id = $1 RETURNING *`,
    [id]
  );
}

function findById(id) {
  return pool.query('SELECT * FROM applications WHERE id = $1', [id]);
}

function findByPartnerId(partnerId) {
  return pool.query('SELECT * FROM applications WHERE partner_id = $1 ORDER BY applied_at DESC', [partnerId]);
}

// BR-6: applied_count는 여기서 건드리지 않는다(슬롯 미반환).
function cancelApplication(id) {
  return pool.query(
    `UPDATE applications SET status = 'canceled', canceled_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
}

function countByStatus(promotionId) {
  return pool.query(
    'SELECT status, COUNT(*)::int AS count FROM applications WHERE promotion_id = $1 GROUP BY status',
    [promotionId]
  );
}

function discountDistribution(promotionId) {
  // discount_rate는 NUMERIC(5,2) 컬럼이라 pg가 기본적으로 문자열("5.00")로 반환한다.
  // ::int로 캐스팅해 discount_distribution의 정수 키(5/10/15/20)와 정확히 매칭시킨다.
  return pool.query(
    `SELECT dr.discount_rate::int AS discount_rate, COUNT(*)::int AS count
     FROM draw_results dr JOIN applications a ON a.id = dr.application_id
     WHERE a.promotion_id = $1
     GROUP BY dr.discount_rate`,
    [promotionId]
  );
}

function listByPromotion(promotionId) {
  // discount_rate는 NUMERIC 컬럼이라 pg가 문자열로 반환하므로 ::int로 캐스팅한다(응답 스펙상 number).
  return pool.query(
    `SELECT p.name AS partner_name, a.status, a.applied_at, dr.discount_rate::int AS discount_rate
     FROM applications a
     JOIN partners p ON p.id = a.partner_id
     LEFT JOIN draw_results dr ON dr.application_id = a.id
     WHERE a.promotion_id = $1
     ORDER BY a.applied_at`,
    [promotionId]
  );
}

module.exports = {
  findByPromotionAndPartner,
  insertApplication,
  reactivateApplication,
  findById,
  findByPartnerId,
  cancelApplication,
  countByStatus,
  discountDistribution,
  listByPromotion,
};
