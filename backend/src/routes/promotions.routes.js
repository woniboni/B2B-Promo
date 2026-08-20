const express = require('express');
const auth = require('../middlewares/auth');
const {
  list,
  getById,
  adminList,
  adminCreate,
  adminUpdate,
  adminUpdateStatus,
  adminApplicationsSummary,
} = require('../controllers/promotions.controller');

const router = express.Router();

router.use(auth);

router.get('/', list);
router.get('/:id', getById);

const adminRouter = express.Router();

adminRouter.use(auth);

adminRouter.get('/', adminList);
adminRouter.post('/', adminCreate);
adminRouter.put('/:id', adminUpdate);
adminRouter.patch('/:id/status', adminUpdateStatus);
adminRouter.get('/:id/applications', adminApplicationsSummary);

module.exports = { router, adminRouter };
