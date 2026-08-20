import { useAuthStore } from './authStore';

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  localStorage.clear();
});

test('setTokens updates accessToken and refreshToken', () => {
  useAuthStore.getState().setTokens('a', 'r');
  expect(useAuthStore.getState().accessToken).toBe('a');
  expect(useAuthStore.getState().refreshToken).toBe('r');
});

test('setUser updates user', () => {
  const user = { id: 1, name: '홍길동' };
  useAuthStore.getState().setUser(user);
  expect(useAuthStore.getState().user).toEqual(user);
});

test('logout clears accessToken, refreshToken, user', () => {
  useAuthStore.getState().setTokens('a', 'r');
  useAuthStore.getState().setUser({ id: 1 });
  useAuthStore.getState().logout();

  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().refreshToken).toBeNull();
  expect(useAuthStore.getState().user).toBeNull();
});

test('persists tokens to localStorage under auth-storage key', () => {
  useAuthStore.getState().setTokens('persisted-access', 'persisted-refresh');

  const raw = localStorage.getItem('auth-storage');
  expect(raw).toEqual(expect.any(String));
  expect(raw).toContain('persisted-access');
  expect(raw).toContain('persisted-refresh');
});
