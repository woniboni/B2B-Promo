const pool = require('../db/pool');
const { findById: findPromotionById } = require('../db/promotions.queries');
const { findPartnerIdByUserId } = require('../db/users.queries');
const {
  findByPromotionAndPartner,
  insertApplication,
  reactivateApplication,
  findById: findApplicationById,
  findByPartnerId,
  cancelApplication,
} = require('../db/applications.queries');
const { drawDiscountRate, upsertDrawResult, findByApplicationId } = require('../db/drawResults.queries');

const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });
const conflict = (msg) => Object.assign(new Error(msg), { status: 409 });
const forbidden = (msg) => Object.assign(new Error(msg), { status: 403 });

// UC-3: 참여신청 + (있다면) 쿠폰 추첨을 하나의 트랜잭션으로 처리한다.
async function apply(req, res, next) {
  const promotionId = Number(req.params.id);
  if (!Number.isInteger(promotionId)) {
    return next(notFound('프로모션을 찾을 수 없습니다.'));
  }

  const promotion = await findPromotionById(promotionId);
  if (!promotion) {
    return next(notFound('프로모션을 찾을 수 없습니다.'));
  }
  if (promotion.status === 'closed') {
    return next(conflict('종료된 프로모션에는 신청할 수 없습니다.'));
  }

  const { rows: partnerRows } = await findPartnerIdByUserId(req.user.id);
  const partner = partnerRows[0];
  if (!partner) {
    return next(forbidden('거래처 담당자만 신청할 수 있습니다.'));
  }
  const partnerId = partner.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await findByPromotionAndPartner(client, promotionId, partnerId);
    const existing = existingRows[0];
    if (existing && existing.status === 'applied') {
      await client.query('ROLLBACK');
      return next(conflict('이미 신청한 프로모션입니다.'));
    }

    if (promotion.coupon_event) {
      const { rowCount } = await client.query(
        'UPDATE coupon_events SET applied_count = applied_count + 1 WHERE id = $1 AND applied_count < capacity RETURNING applied_count',
        [promotion.coupon_event.id]
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return next(conflict('마감되었습니다.'));
      }
    }

    let application;
    if (existing) {
      const { rows } = await reactivateApplication(client, existing.id);
      application = rows[0];
    } else {
      const { rows } = await insertApplication(client, { promotionId, partnerId });
      application = rows[0];
    }

    let drawResult = null;
    if (promotion.coupon_event) {
      const discountRate = drawDiscountRate();
      const { rows } = await upsertDrawResult(client, { applicationId: application.id, discountRate });
      drawResult = rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json({ application, draw_result: drawResult });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return next(conflict('이미 신청한 프로모션입니다.'));
    }
    next(err);
  } finally {
    client.release();
  }
}

// UC-4: 참여신청 취소. BR-11에 따라 프로모션 상태와 무관하게 본인 신청건은 취소 가능.
async function cancel(req, res, next) {
  const applicationId = Number(req.params.id);
  if (!Number.isInteger(applicationId)) {
    return next(notFound('신청 내역을 찾을 수 없습니다.'));
  }

  try {
    const { rows } = await findApplicationById(applicationId);
    const application = rows[0];
    if (!application) {
      return next(notFound('신청 내역을 찾을 수 없습니다.'));
    }

    const { rows: partnerRows } = await findPartnerIdByUserId(req.user.id);
    const partner = partnerRows[0];
    if (!partner || partner.id !== application.partner_id) {
      return next(forbidden('본인 소유의 신청건만 취소할 수 있습니다.'));
    }

    const { rows: updatedRows } = await cancelApplication(applicationId);
    res.status(200).json(updatedRows[0]);
  } catch (err) {
    next(err);
  }
}

// UC-5: 내 참여신청 목록. 신청 수십 건 규모의 MVP이므로 이미 검증된 findById류를
// N+1로 재사용한다(새 JOIN 설계 없음).
async function myApplications(req, res, next) {
  try {
    const { rows: partnerRows } = await findPartnerIdByUserId(req.user.id);
    const partner = partnerRows[0];
    if (!partner) {
      // 관리자 토큰 등 파트너가 없는 사용자는 신청 이력이 없으므로 빈 배열로 응답한다.
      return res.status(200).json([]);
    }

    const { rows: applicationRows } = await findByPartnerId(partner.id);
    const results = await Promise.all(
      applicationRows.map(async (application) => {
        const [promotion, drawResultRows] = await Promise.all([
          findPromotionById(application.promotion_id),
          findByApplicationId(application.id),
        ]);
        return { ...application, promotion, draw_result: drawResultRows.rows[0] || null };
      })
    );

    res.status(200).json(results);
  } catch (err) {
    next(err);
  }
}

module.exports = { apply, cancel, myApplications };
