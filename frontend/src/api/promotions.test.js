import { vi } from 'vitest';
import { fetchPromotions, fetchPromotionDetail } from './promotions';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'access-1', refreshToken: 'refresh-1', user: null });
  global.fetch = vi.fn();
});

test('fetchPromotions requests /promotions', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([]));

  await fetchPromotions();

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url] = fetch.mock.calls[0];
  expect(url).toContain('/promotions');
});

test('fetchPromotionDetail(1) requests /promotions/1', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

  await fetchPromotionDetail(1);

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url] = fetch.mock.calls[0];
  expect(url).toContain('/promotions/1');
});
