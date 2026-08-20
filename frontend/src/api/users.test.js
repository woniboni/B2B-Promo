import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { fetchMe, updateMe, changePassword, useMe, useUpdateMe, useChangePassword } from './users';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

function makeWrapper(queryClient) {
  return function wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 1, email: 'partner@example.com', role: 'partner' },
  });
  global.fetch = vi.fn();
});

test('fetchMe requests GET /users/me', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1, email: 'a@b.com' }));

  await fetchMe();

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/users/me');
  expect(options?.method ?? 'GET').toBe('GET');
});

test('updateMe(payload) sends PATCH to /users/me', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1, name: '새이름' }));

  await updateMe({ name: '새이름', phone: '010-0000-0000' });

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/users/me');
  expect(options.method).toBe('PATCH');
  expect(JSON.parse(options.body)).toEqual({ name: '새이름', phone: '010-0000-0000' });
});

test('changePassword(payload) sends PATCH to /users/me/password', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ message: '비밀번호가 변경되었습니다.' }));

  await changePassword({ current_password: 'old1234', new_password: 'new12345' });

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/users/me/password');
  expect(options.method).toBe('PATCH');
  expect(JSON.parse(options.body)).toEqual({ current_password: 'old1234', new_password: 'new12345' });
});

test('useMe fetches with queryKey ["users","me"]', async () => {
  const me = { id: 1, email: 'a@b.com', name: '이름', phone: '010-1234-5678' };
  fetch.mockResolvedValueOnce(jsonResponse(me));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const { result } = renderHook(() => useMe(), { wrapper: makeWrapper(queryClient) });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(result.current.data).toEqual(me);
  expect(queryClient.getQueryData(['users', 'me'])).toEqual(me);
});

test('useUpdateMe sends PATCH and invalidates ["users","me"] on success', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1, name: '새이름' }));
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');

  const { result } = renderHook(() => useUpdateMe(), { wrapper: makeWrapper(queryClient) });

  result.current.mutate({ name: '새이름', phone: '010-0000-0000' });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const invalidatedKeys = spy.mock.calls.map((call) => call[0].queryKey);
  expect(invalidatedKeys).toContainEqual(['users', 'me']);
});

test('useChangePassword sends PATCH and resolves with the success message', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ message: '비밀번호가 변경되었습니다.' }));
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  const { result } = renderHook(() => useChangePassword(), { wrapper: makeWrapper(queryClient) });

  result.current.mutate({ current_password: 'old1234', new_password: 'new12345' });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual({ message: '비밀번호가 변경되었습니다.' });
});

test('useChangePassword surfaces the 400 error on current-password mismatch', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ error: '현재 비밀번호가 올바르지 않습니다.' }, { ok: false, status: 400 }));
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  const { result } = renderHook(() => useChangePassword(), { wrapper: makeWrapper(queryClient) });

  result.current.mutate({ current_password: 'wrong', new_password: 'new12345' });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error.body.error).toBe('현재 비밀번호가 올바르지 않습니다.');
});
