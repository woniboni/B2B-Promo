import { vi } from 'vitest';
import { apiFetch } from './client';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  global.fetch = vi.fn();
  delete window.location;
  window.location = { href: '' };
});

test('sends Authorization header with accessToken and returns json on success', async () => {
  useAuthStore.setState({ accessToken: 'token-1', refreshToken: 'refresh-1' });
  fetch.mockResolvedValueOnce(jsonResponse({ data: 'ok' }));

  const result = await apiFetch('/promotions');

  expect(fetch).toHaveBeenCalledTimes(1);
  const [, options] = fetch.mock.calls[0];
  expect(options.headers.Authorization).toBe('Bearer token-1');
  expect(result).toEqual({ data: 'ok' });
});

test('refreshes token on 401 and retries original request once', async () => {
  useAuthStore.setState({ accessToken: 'expired', refreshToken: 'refresh-1' });

  fetch
    .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })) // original
    .mockResolvedValueOnce(jsonResponse({ access_token: 'new' })) // refresh
    .mockResolvedValueOnce(jsonResponse({ result: 'ok' })); // retry

  const result = await apiFetch('/promotions');

  expect(fetch).toHaveBeenCalledTimes(3);

  const [refreshUrl, refreshOptions] = fetch.mock.calls[1];
  expect(refreshUrl).toContain('/auth/refresh');
  expect(JSON.parse(refreshOptions.body)).toEqual({ refresh_token: 'refresh-1' });

  const [, retryOptions] = fetch.mock.calls[2];
  expect(retryOptions.headers.Authorization).toBe('Bearer new');

  expect(useAuthStore.getState().accessToken).toBe('new');
  expect(result).toEqual({ result: 'ok' });
});

test('logs out and redirects to /login when refresh itself fails', async () => {
  useAuthStore.setState({ accessToken: 'expired', refreshToken: 'refresh-1' });

  fetch
    .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })) // original
    .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })); // refresh fails

  await expect(apiFetch('/promotions')).rejects.toThrow();

  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().refreshToken).toBeNull();
  expect(window.location.href).toBe('/login');
});

test('logs out immediately on 401 when no refreshToken is present', async () => {
  useAuthStore.setState({ accessToken: 'expired', refreshToken: null });

  fetch.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }));

  await expect(apiFetch('/promotions')).rejects.toThrow();

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(window.location.href).toBe('/login');
});

test('throws with server error message on non-401 failure without touching auth state', async () => {
  useAuthStore.setState({ accessToken: 'token-1', refreshToken: 'refresh-1' });

  fetch.mockResolvedValueOnce(jsonResponse({ error: '마감되었습니다.' }, { ok: false, status: 409 }));

  await expect(apiFetch('/promotions/1/apply', { method: 'POST' })).rejects.toThrow('마감되었습니다.');

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().accessToken).toBe('token-1');
  expect(window.location.href).toBe('');
});
