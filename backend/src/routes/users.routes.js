const express = require('express');
const auth = require('../middlewares/auth');
const { getMe, updateMe, changePassword } = require('../controllers/users.controller');

const router = express.Router();
router.use(auth);

router.get('/me', getMe);
router.patch('/me', updateMe);
router.patch('/me/password', changePassword);

module.exports = router;
