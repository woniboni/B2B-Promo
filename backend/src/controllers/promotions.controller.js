const pool = require('../db/pool');
const {
  listPublished,
  findById,
  listAll,
  insertPromotion,
  updatePromotion,
  updateStatus,
} = require('../db/promotions.queries');
const { insertCouponEvent } = require('../db/couponEvents.queries');
const { countByStatus, discountDistribution, listByPromotion } = require('../db/applications.queries');

function requireAdmin(req) {
  if (req.user.role !== 'admin') {
    throw Object.assign(new Error('관리자 권한이 필요합니다.'), { status: 403 });
  }
}

async function list(req, res, next) {
  try {
    const promotions = await listPublished();
    res.status(200).json(promotions);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  const notFound = Object.assign(new Error('프로모션을 찾을 수 없습니다.'), { status: 404 });

  // pg 정수 캐스팅 오류(500) 방지: 정수 형식이 아니면 즉시 404 처리.
  if (!/^\d+$/.test(req.params.id)) {
    return next(notFound);
  }

  try {
    const promotion = await findById(req.params.id);
    if (!promotion) {
      return next(notFound);
    }
    res.status(200).json(promotion);
  } catch (err) {
    next(err);
  }
}

async function adminList(req, res, next) {
  try {
    requireAdmin(req);
    const promotions = await listAll();
    res.status(200).json(promotions);
  } catch (err) {
    next(err);
  }
}

async function adminCreate(req, res, next) {
  const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

  try {
    requireAdmin(req);

    const { title, type, description, status, coupon_event: couponEvent } = req.body || {};

    if (!title || !type) {
      return next(badRequest('필수 항목이 누락되었습니다.'));
    }
    const resolvedStatus = status || 'draft';
    if (!['draft', 'published'].includes(resolvedStatus)) {
      return next(badRequest('등록 시 상태는 draft 또는 published만 가능합니다.'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await insertPromotion(client, {
        title,
        type,
        description,
        status: resolvedStatus,
        createdBy: req.user.id,
      });
      const promotionId = rows[0].id;
      if (couponEvent === true) {
        await insertCouponEvent(client, promotionId);
      }
      await client.query('COMMIT');
      const promotion = await findById(promotionId);
      res.status(201).json(promotion);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23514') {
        return next(badRequest('유효하지 않은 프로모션 정보입니다.'));
      }
      next(err);
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

async function adminUpdate(req, res, next) {
  const notFound = Object.assign(new Error('프로모션을 찾을 수 없습니다.'), { status: 404 });

  try {
    requireAdmin(req);

    if (!/^\d+$/.test(req.params.id)) {
      return next(notFound);
    }

    const { title, type, description } = req.body || {};
    const { rowCount } = await updatePromotion(req.params.id, { title, type, description });
    if (rowCount === 0) {
      return next(notFound);
    }
    const promotion = await findById(req.params.id);
    res.status(200).json(promotion);
  } catch (err) {
    if (err.code === '23514') {
      return next(Object.assign(new Error('유효하지 않은 프로모션 정보입니다.'), { status: 400 }));
    }
    next(err);
  }
}

async function adminUpdateStatus(req, res, next) {
  const notFound = Object.assign(new Error('프로모션을 찾을 수 없습니다.'), { status: 404 });

  try {
    requireAdmin(req);

    if (!/^\d+$/.test(req.params.id)) {
      return next(notFound);
    }

    const { status } = req.body || {};
    if (!['published', 'closed'].includes(status)) {
      return next(Object.assign(new Error('상태값은 published 또는 closed만 가능합니다.'), { status: 400 }));
    }

    const { rowCount } = await updateStatus(req.params.id, status);
    if (rowCount === 0) {
      return next(notFound);
    }
    const promotion = await findById(req.params.id);
    res.status(200).json(promotion);
  } catch (err) {
    next(err);
  }
}

async function adminApplicationsSummary(req, res, next) {
  const notFound = Object.assign(new Error('프로모션을 찾을 수 없습니다.'), { status: 404 });
  try {
    requireAdmin(req);

    if (!/^\d+$/.test(req.params.id)) {
      return next(notFound);
    }
    const promotionId = req.params.id;

    const [promotion, statusRows, distributionRows, applicationRows] = await Promise.all([
      findById(promotionId),
      countByStatus(promotionId),
      discountDistribution(promotionId),
      listByPromotion(promotionId),
    ]);

    if (!promotion) {
      return next(notFound);
    }

    const appliedRow = statusRows.rows.find((r) => r.status === 'applied');
    const canceledRow = statusRows.rows.find((r) => r.status === 'canceled');

    const discountDist = { 5: 0, 10: 0, 15: 0, 20: 0 };
    distributionRows.rows.forEach((row) => {
      discountDist[row.discount_rate] = row.count;
    });

    res.status(200).json({
      promotion_id: Number(promotionId),
      applied_status_count: appliedRow ? appliedRow.count : 0,
      canceled_count: canceledRow ? canceledRow.count : 0,
      coupon_event: promotion.coupon_event,
      discount_distribution: discountDist,
      applications: applicationRows.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  getById,
  adminList,
  adminCreate,
  adminUpdate,
  adminUpdateStatus,
  adminApplicationsSummary,
};
