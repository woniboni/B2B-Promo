const express = require('express');
const auth = require('../middlewares/auth');
const { apply, cancel, myApplications } = require('../controllers/applications.controller');

const router = express.Router();
// ponytail: 이 라우터가 app 루트('/')에 마운트되므로 router.use(auth)로 전체를 감싸면
// 매칭되지 않는 다른 경로(예: 존재하지 않는 라우트)까지 auth를 먼저 타 401을 반환하고
// 404로 떨어지지 못한다. 라우트별로 auth를 개별 적용해 이 라우터가 처리하지 않는
// 경로는 그대로 다음 미들웨어(최종 404)로 넘어가게 한다.
router.post('/promotions/:id/apply', auth, apply);
router.patch('/applications/:id/cancel', auth, cancel);
router.get('/applications/me', auth, myApplications);

module.exports = router;
