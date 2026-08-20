const pool = require('./pool');

function findByEmail(email) {
  return pool.query('SELECT * FROM users WHERE email = $1', [email]);
}

// client는 트랜잭션 커넥션(pool.connect() 결과). role은 BR-2에 따라 항상 'partner'로 고정.
function insertUser(client, { email, passwordHash, name, phone }) {
  return client.query(
    `INSERT INTO users (email, password_hash, role, name, phone)
     VALUES ($1, $2, 'partner', $3, $4)
     RETURNING id, email, role, name, phone, created_at, updated_at`,
    [email, passwordHash, name, phone || null]
  );
}

function insertPartner(client, { name, userId }) {
  return client.query(
    `INSERT INTO partners (name, user_id)
     VALUES ($1, $2)
     RETURNING id, name, user_id, created_at`,
    [name, userId]
  );
}

function findPartnerIdByUserId(userId) {
  return pool.query('SELECT id FROM partners WHERE user_id = $1', [userId]);
}

function findById(id) {
  return pool.query('SELECT * FROM users WHERE id = $1', [id]);
}

function updateProfile(id, { name, phone }) {
  return pool.query(
    `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone), updated_at = now()
     WHERE id = $1 RETURNING id, email, role, name, phone, created_at, updated_at`,
    [id, name || null, phone || null]
  );
}

function updatePassword(id, passwordHash) {
  return pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);
}

module.exports = {
  findByEmail,
  insertUser,
  insertPartner,
  findPartnerIdByUserId,
  findById,
  updateProfile,
  updatePassword,
};
