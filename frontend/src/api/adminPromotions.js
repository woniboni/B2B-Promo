import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export function fetchAdminPromotions() {
  return apiFetch('/admin/promotions');
}
export function createPromotion(payload) {
  return apiFetch('/admin/promotions', { method: 'POST', body: JSON.stringify(payload) });
}
export function updatePromotion(id, payload) {
  return apiFetch(`/admin/promotions/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function updatePromotionStatus(id, status) {
  return apiFetch(`/admin/promotions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function fetchApplicationsSummary(id) {
  return apiFetch(`/admin/promotions/${id}/applications`);
}

export function useAdminPromotions() {
  return useQuery({ queryKey: ['admin', 'promotions'], queryFn: fetchAdminPromotions });
}

export function useCreatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPromotion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
    },
  });
}

export function useUpdatePromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => updatePromotion(id, payload),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
      queryClient.invalidateQueries({ queryKey: ['promotions', String(id)] });
    },
  });
}

export function useUpdatePromotionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => updatePromotionStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
    },
  });
}

export function useApplicationsSummary(id) {
  return useQuery({
    queryKey: ['admin', 'promotions', id, 'applications'],
    queryFn: () => fetchApplicationsSummary(id),
    enabled: !!id,
  });
}
