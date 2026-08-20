import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export function fetchMe() {
  return apiFetch('/users/me');
}
export function updateMe(payload) {
  return apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(payload) });
}
export function changePassword(payload) {
  return apiFetch('/users/me/password', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function useMe() {
  return useQuery({ queryKey: ['users', 'me'], queryFn: fetchMe });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'me'] }),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}
