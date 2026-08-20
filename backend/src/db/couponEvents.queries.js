// capacity는 DB DEFAULT 50을 그대로 사용한다(BR-6). JS에서 지정하지 않는다.
function insertCouponEvent(client, promotionId) {
  return client.query('INSERT INTO coupon_events (promotion_id) VALUES ($1) RETURNING *', [promotionId]);
}

module.exports = { insertCouponEvent };
