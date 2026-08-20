import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export const PROMOTION_TYPE_LABELS = {
  price_discount: '가격할인',
  sample: '샘플증정',
  tasting: '신제품시식',
  bogo: '1+1',
};

export function fetchPromotions() {
  return apiFetch('/promotions');
}

export function fetchPromotionDetail(id) {
  return apiFetch(`/promotions/${id}`);
}

export function usePromotions() {
  return useQuery({ queryKey: ['promotions'], queryFn: fetchPromotions });
}

export function usePromotionDetail(id) {
  return useQuery({
    queryKey: ['promotions', id],
    queryFn: () => fetchPromotionDetail(id),
    enabled: !!id,
  });
}
