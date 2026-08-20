import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';

export function applyToPromotion(promotionId) {
  return apiFetch(`/promotions/${promotionId}/apply`, { method: 'POST' });
}

export function useApplyPromotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyToPromotion,
    onSuccess: (_data, promotionId) => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['promotions', promotionId] });
      queryClient.invalidateQueries({ queryKey: ['applications', 'me'] });
    },
  });
}

export function fetchMyApplications() {
  return apiFetch('/applications/me');
}

export function useMyApplications() {
  return useQuery({ queryKey: ['applications', 'me'], queryFn: fetchMyApplications });
}

export function cancelApplication(applicationId) {
  return apiFetch(`/applications/${applicationId}/cancel`, { method: 'PATCH' });
}

export function useCancelApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelApplication,
    // BR-6: 취소는 applied_count를 되돌리지 않으므로 ['promotions']는 무효화하지 않는다.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications', 'me'] }),
  });
}
