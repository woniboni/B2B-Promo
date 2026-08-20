import { useMutation } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useAuthStore } from '../store/authStore';

export function signup(payload) {
  return apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
}

export function login({ email, password }) {
  return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function useSignup() {
  return useMutation({ mutationFn: signup });
}

export function useLogin() {
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
    },
  });
}
