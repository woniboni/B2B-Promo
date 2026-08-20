import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import {
  fetchAdminPromotions,
  createPromotion,
  updatePromotion,
  updatePromotionStatus,
  useAdminPromotions,
  useCreatePromotion,
  useUpdatePromotion,
  useUpdatePromotionStatus,
} from './adminPromotions';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

// 훅 테스트에서 invalidateQueries 호출 대상을 spy로 검증하기 위해
// queryClient 인스턴스를 밖에서 만들어 wrapper에 주입한다.
function makeWrapper(queryClient) {
  return function wrapper({ children }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 1, email: 'admin@example.com', role: 'admin' },
  });
  global.fetch = vi.fn();
});

test('fetchAdminPromotions requests GET /admin/promotions', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([]));

  await fetchAdminPromotions();

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/admin/promotions');
  expect(options?.method ?? 'GET').toBe('GET');
});

test('createPromotion posts payload as JSON to POST /admin/promotions', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { status: 201 }));
  const payload = { title: '신규 프로모션', type: 'sample', description: '설명', status: 'draft', coupon_event: false };

  await createPromotion(payload);

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/admin/promotions');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual(payload);
});

test('updatePromotion(id, payload) sends PUT to /admin/promotions/:id', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 5 }));
  const payload = { title: '수정된 제목', type: 'price_discount', description: '수정 설명' };

  await updatePromotion(5, payload);

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/admin/promotions/5');
  expect(options.method).toBe('PUT');
  expect(JSON.parse(options.body)).toEqual(payload);
});

test('updatePromotionStatus(id, status) sends PATCH to /admin/promotions/:id/status', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 5, status: 'published' }));

  await updatePromotionStatus(5, 'published');

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/admin/promotions/5/status');
  expect(options.method).toBe('PATCH');
  expect(JSON.parse(options.body)).toEqual({ status: 'published' });
});

test('useAdminPromotions fetches with queryKey ["admin","promotions"]', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([{ id: 1, title: 'A' }]));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const { result } = renderHook(() => useAdminPromotions(), { wrapper: makeWrapper(queryClient) });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(result.current.data).toEqual([{ id: 1, title: 'A' }]);
  expect(queryClient.getQueryData(['admin', 'promotions'])).toEqual([{ id: 1, title: 'A' }]);
});

// 완료조건 5: draft로 등록 시 성공하면 ['admin','promotions']와 ['promotions'] 둘 다 무효화된다
// (BR-9/완료조건2의 "게시 시 거래처 목록에 즉시 노출"이 이 무효화를 통해 이뤄짐을 뒷받침)
test('useCreatePromotion invalidates ["admin","promotions"] and ["promotions"] on success', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { status: 201 }));
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');

  const { result } = renderHook(() => useCreatePromotion(), { wrapper: makeWrapper(queryClient) });

  result.current.mutate({ title: '신규', type: 'sample', description: '', status: 'draft', coupon_event: false });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const invalidatedKeys = spy.mock.calls.map((call) => call[0].queryKey);
  expect(invalidatedKeys).toContainEqual(['admin', 'promotions']);
  expect(invalidatedKeys).toContainEqual(['promotions']);
});

test('useUpdatePromotion({id,payload}) sends PUT and invalidates ["admin","promotions"]', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 5 }));
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');

  const { result } = renderHook(() => useUpdatePromotion(), { wrapper: makeWrapper(queryClient) });

  result.current.mutate({ id: 5, payload: { title: '수정', type: 'sample', description: '설명' } });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/admin/promotions/5');
  expect(options.method).toBe('PUT');

  const invalidatedKeys = spy.mock.calls.map((call) => call[0].queryKey);
  expect(invalidatedKeys).toContainEqual(['admin', 'promotions']);
});

// 완료조건 2/3: 게시/종료 상태 전환 mutation이 ['admin','promotions']와 ['promotions']를
// 모두 무효화 대상에 포함하는지 검증한다. 실제로 파트너 목록 화면(PromotionListPage)에
// 즉시 반영되는지는 크로스 페이지 검증이라 이 파일 범위를 벗어나며, 별도로 Chrome DevTools
// 실측으로 확인할 예정이다(보고에 명시).
test.each(['published', 'closed'])(
  'useUpdatePromotionStatus({id,status:"%s"}) sends PATCH and invalidates ["admin","promotions"] and ["promotions"]',
  async (status) => {
    fetch.mockResolvedValueOnce(jsonResponse({ id: 5, status }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdatePromotionStatus(), { wrapper: makeWrapper(queryClient) });

    result.current.mutate({ id: 5, status });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('/admin/promotions/5/status');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ status });

    const invalidatedKeys = spy.mock.calls.map((call) => call[0].queryKey);
    expect(invalidatedKeys).toContainEqual(['admin', 'promotions']);
    expect(invalidatedKeys).toContainEqual(['promotions']);
  }
);
