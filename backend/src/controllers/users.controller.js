const bcrypt = require('bcrypt');
const { findById, updateProfile, updatePassword } = require('../db/users.queries');

const BCRYPT_COST_FACTOR = 10;

async function getMe(req, res, next) {
  try {
    const { rows } = await findById(req.user.id);
    const user = rows[0];
    const { password_hash: _passwordHash, ...safeUser } = user;
    res.status(200).json(safeUser);
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const { name, phone } = req.body || {};
    const { rows } = await updateProfile(req.user.id, { name, phone });
    res.status(200).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return next(Object.assign(new Error('필수 항목이 누락되었습니다.'), { status: 400 }));
    }
    if (newPassword.length < 8) {
      return next(Object.assign(new Error('비밀번호는 8자 이상이어야 합니다.'), { status: 400 }));
    }

    const { rows } = await findById(req.user.id);
    const user = rows[0];
    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) {
      return next(Object.assign(new Error('현재 비밀번호가 올바르지 않습니다.'), { status: 400 }));
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);
    await updatePassword(req.user.id, passwordHash);
    res.status(200).json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe, changePassword };
