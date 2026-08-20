import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { signup, login, useLogin } from './auth';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

// wrapper is plain createElement (not JSX) so this file can stay .js like client.test.js
function wrapper({ children }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  global.fetch = vi.fn();
});

test('signup posts payload as JSON to /auth/signup', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { status: 201 }));
  const payload = {
    email: 'partner@example.com',
    password: 'pw1234',
    name: '홍길동',
    phone: '010-1234-5678',
    partner_name: 'OO식당',
  };

  await signup(payload);

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/auth/signup');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual(payload);
});

test('login posts email/password as JSON to /auth/login', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({ access_token: 'a', refresh_token: 'r', user: { id: 1, role: 'partner' } })
  );

  await login({ email: 'partner@example.com', password: 'pw1234' });

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/auth/login');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({ email: 'partner@example.com', password: 'pw1234' });
});

test('useLogin onSuccess stores access/refresh tokens and user in authStore', async () => {
  const user = { id: 1, email: 'partner@example.com', role: 'partner' };
  fetch.mockResolvedValueOnce(
    jsonResponse({ access_token: 'access-1', refresh_token: 'refresh-1', user })
  );

  const { result } = renderHook(() => useLogin(), { wrapper });

  result.current.mutate({ email: 'partner@example.com', password: 'pw1234' });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(useAuthStore.getState().accessToken).toBe('access-1');
  expect(useAuthStore.getState().refreshToken).toBe('refresh-1');
  expect(useAuthStore.getState().user).toEqual(user);
});

test('useLogin does not modify authStore when login fails', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { ok: false, status: 401 })
  );

  const { result } = renderHook(() => useLogin(), { wrapper });

  result.current.mutate({ email: 'partner@example.com', password: 'wrong' });

  await waitFor(() => expect(result.current.isError).toBe(true));

  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().refreshToken).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});
