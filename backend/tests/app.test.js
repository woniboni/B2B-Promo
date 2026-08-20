require('dotenv').config();
const request = require('supertest');

// 미리 구동해둔 개발 서버(예: `npm run dev`, PORT=3000)를 대상으로 테스트한다.
const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

describe('app', () => {
  test('GET / returns 200 with JSON body', async () => {
    const res = await request(BASE_URL).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.type).toMatch(/json/);
  });

  test('CORS reflects FRONTEND_ORIGIN when Origin header is sent', async () => {
    const res = await request(BASE_URL).get('/').set('Origin', process.env.FRONTEND_ORIGIN || 'http://localhost:5173');
    expect(res.status).toBe(200);
    if (res.headers['access-control-allow-origin']) {
      expect(res.headers['access-control-allow-origin']).toBe(process.env.FRONTEND_ORIGIN || 'http://localhost:5173');
    }
  });

  test('GET /nonexistent-route-xyz returns 404', async () => {
    const res = await request(BASE_URL).get('/nonexistent-route-xyz');
    expect(res.status).toBe(404);
  });
});
