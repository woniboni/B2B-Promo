import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import AdminPromotionFormPage from './AdminPromotionFormPage';
import { useAuthStore } from '../../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

function renderPage(initialEntry) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin" element={<div>관리자 목록 화면</div>} />
          <Route path="/admin/promotions/new" element={<AdminPromotionFormPage />} />
          <Route path="/admin/promotions/:id/edit" element={<AdminPromotionFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 1, email: 'admin@example.com', role: 'admin' },
  });
  global.fetch = vi.fn();
});

// ---- 생성 모드 (create, no :id) -------------------------------------------

test('create mode shows title/type/description fields and 임시저장/게시하기/취소 buttons', () => {
  renderPage('/admin/promotions/new');

  expect(screen.getByLabelText(/제목/)).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '가격할인' })).toBeInTheDocument();
  expect(screen.getByLabelText(/설명/)).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /쿠폰\s*이벤트/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '임시저장' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '게시하기' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
});

function fillCreateForm({ title = '신규 프로모션', typeLabel = '가격할인', description = '설명입니다', couponEvent = false } = {}) {
  fireEvent.change(screen.getByLabelText(/제목/), { target: { value: title } });
  fireEvent.click(screen.getByRole('radio', { name: typeLabel }));
  fireEvent.change(screen.getByLabelText(/설명/), { target: { value: description } });
  const checkbox = screen.getByRole('checkbox', { name: /쿠폰\s*이벤트/ });
  if (couponEvent && !checkbox.checked) fireEvent.click(checkbox);
}

// 완료조건 5 (UC-6): "임시저장" 클릭 시 POST 바디에 status:'draft'가 정확히 담긴다
test('clicking 임시저장 posts status:draft with the entered values', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 10, status: 'draft' }, { status: 201 }));

  renderPage('/admin/promotions/new');
  fillCreateForm({ title: '신규 프로모션', typeLabel: '가격할인', description: '설명입니다' });
  fireEvent.click(screen.getByRole('button', { name: '임시저장' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

  const [url, options] = fetch.mock.calls[0];
  expect(url).toContain('/admin/promotions');
  expect(options.method).toBe('POST');
  const body = JSON.parse(options.body);
  expect(body).toMatchObject({
    title: '신규 프로모션',
    type: 'price_discount',
    description: '설명입니다',
    status: 'draft',
  });
});

test('clicking 게시하기 posts status:published with the entered values', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 10, status: 'published' }, { status: 201 }));

  renderPage('/admin/promotions/new');
  fillCreateForm({ title: '즉시 게시', typeLabel: '샘플증정', description: '설명' });
  fireEvent.click(screen.getByRole('button', { name: '게시하기' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

  const [, options] = fetch.mock.calls[0];
  const body = JSON.parse(options.body);
  expect(body).toMatchObject({ title: '즉시 게시', type: 'sample', status: 'published' });
});

// 완료조건 4 (BR-6): 쿠폰 이벤트 체크 시 정원이 50으로 고정 표시되고, 임의로 변경할 숫자 입력이 없다
test('checking the coupon-event checkbox shows a fixed capacity of 50 with no numeric input to change it', () => {
  renderPage('/admin/promotions/new');

  // 체크 전에도, 체크 후에도 정원을 직접 입력하는 숫자 필드는 DOM에 존재하지 않는다.
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

  const checkbox = screen.getByRole('checkbox', { name: /쿠폰\s*이벤트/ });
  fireEvent.click(checkbox);

  expect(checkbox.checked).toBe(true);
  expect(screen.getByText(/50\s*명\s*고정/)).toBeInTheDocument();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
});

// 완료조건 5와 BR-6를 함께: 체크한 상태로 임시저장하면 coupon_event:true가 전송된다
test('submitting with the coupon-event checkbox checked sends coupon_event:true', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 11, status: 'draft' }, { status: 201 }));

  renderPage('/admin/promotions/new');
  fillCreateForm({ couponEvent: true });
  fireEvent.click(screen.getByRole('button', { name: '임시저장' }));

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

  const [, options] = fetch.mock.calls[0];
  expect(JSON.parse(options.body)).toMatchObject({ coupon_event: true, status: 'draft' });
});

// ---- 수정 모드 (edit, :id present) -----------------------------------------

const existingPromotion = {
  id: 1,
  title: '기존 프로모션',
  type: 'sample',
  description: '기존 설명',
  status: 'draft',
  coupon_event: null,
};

// 완료조건 6: 수정 모드 진입 시 기존 값이 프리필된다
test('edit mode prefills the form with the existing promotion values and shows only 저장/취소', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(existingPromotion));

  renderPage('/admin/promotions/1/edit');

  expect(await screen.findByDisplayValue('기존 프로모션')).toBeInTheDocument();
  expect(screen.getByDisplayValue('기존 설명')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '샘플증정' })).toBeChecked();

  expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '임시저장' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '게시하기' })).not.toBeInTheDocument();
});

// 완료조건 6: 수정 저장 클릭 시 PUT 호출 인자에 변경된 값이 담긴다
test('editing the title and clicking 저장 sends a PUT with the updated fields', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(existingPromotion))
    .mockResolvedValueOnce(jsonResponse({ ...existingPromotion, title: '수정된 프로모션' }))
    // PUT 성공 시 useUpdatePromotion이 ['promotions', id]도 무효화해 상세를 재조회할 수 있다.
    // 재조회 이후 추가로 발생할 수 있는 호출까지 대비해 mockResolvedValue(지속형)로 둔다.
    .mockResolvedValue(jsonResponse({ ...existingPromotion, title: '수정된 프로모션' }));

  renderPage('/admin/promotions/1/edit');

  const titleInput = await screen.findByDisplayValue('기존 프로모션');
  fireEvent.change(titleInput, { target: { value: '수정된 프로모션' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  // PUT 성공 후 navigate('/admin')으로 폼이 언마운트되기 전에 invalidateQueries가
  // usePromotionDetail(1)을 재조회할 수 있어(GET /promotions/1) 총 호출 횟수는 구현
  // 세부사항에 따라 2회 이상일 수 있다. PUT 호출 자체를 찾아 인자를 검증한다.
  await waitFor(() => {
    const putCall = fetch.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(putCall).toBeDefined();
  });

  const [url, options] = fetch.mock.calls.find(([, opts]) => opts?.method === 'PUT');
  expect(url).toContain('/admin/promotions/1');
  expect(JSON.parse(options.body)).toMatchObject({
    title: '수정된 프로모션',
    type: 'sample',
    description: '기존 설명',
  });
});

// 완료조건 4 부연: 수정 모드에서는 쿠폰이벤트 체크박스가 없거나 disabled라 정원을 바꿀 수 없다
test('edit mode has no enabled coupon-event checkbox to change the capacity setting', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(existingPromotion));

  renderPage('/admin/promotions/1/edit');
  await screen.findByDisplayValue('기존 프로모션');

  const checkbox = screen.queryByRole('checkbox', { name: /쿠폰\s*이벤트/ });
  if (checkbox) expect(checkbox).toBeDisabled();
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
});
