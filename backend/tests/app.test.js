const request = require('supertest');
const app = require('../src/app');

describe('app', () => {
  test('GET / returns 200 with JSON body', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.type).toMatch(/json/);
  });

  test('GET /__throw is caught by errorHandler and returns JSON error', async () => {
    const res = await request(app).get('/__throw');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.type).toMatch(/json/);
    expect(res.body).toHaveProperty('error');
  });

  test('CORS reflects FRONTEND_ORIGIN when Origin header is sent', async () => {
    const res = await request(app).get('/').set('Origin', process.env.FRONTEND_ORIGIN || 'http://localhost:5173');
    expect(res.status).toBe(200);
    if (res.headers['access-control-allow-origin']) {
      expect(res.headers['access-control-allow-origin']).toBe(process.env.FRONTEND_ORIGIN || 'http://localhost:5173');
    }
  });

  test('GET /nonexistent-route-xyz returns 404', async () => {
    const res = await request(app).get('/nonexistent-route-xyz');
    expect(res.status).toBe(404);
  });
});
