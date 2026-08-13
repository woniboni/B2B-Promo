const pool = require('../src/db/pool');

describe('db pool', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('connects to PostgreSQL and runs a query', async () => {
    const result = await pool.query('SELECT 1');
    expect(result.rows.length).toBe(1);
  });
});
