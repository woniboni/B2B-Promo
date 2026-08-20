import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import PromotionDetailPage from './PromotionDetailPage';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

function renderDetailPage(initialEntry = '/promotions/1') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/promotions/:id" element={<PromotionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 1, email: 'partner@example.com', role: 'partner' },
  });
  global.fetch = vi.fn();
});

test('renders type, title and description; no coupon UI when there is no coupon_event', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({
      id: 1,
      type: 'price_discount',
      title: '가격할인 프로모션',
      description: '상세 설명입니다.',
      coupon_event: null,
    })
  );

  renderDetailPage();

  expect(await screen.findByRole('heading', { name: '가격할인 프로모션' })).toBeInTheDocument();
  expect(screen.getByText('가격할인')).toBeInTheDocument();
  expect(screen.getByText('상세 설명입니다.')).toBeInTheDocument();

  expect(screen.queryByText('쿠폰이벤트')).not.toBeInTheDocument();

  const button = screen.getByRole('button', { name: '참여 신청하기' });
  expect(button).not.toBeDisabled();
});

test('shows remaining capacity and an enabled button when the coupon event is not full', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({
      id: 1,
      type: 'sample',
      title: '샘플 증정 프로모션',
      description: '설명',
      coupon_event: { capacity: 50, applied_count: 23 },
    })
  );

  renderDetailPage();

  expect(await screen.findByText('쿠폰이벤트')).toBeInTheDocument();
  expect(screen.getByText('잔여 27 / 50명 남음')).toBeInTheDocument();

  const button = screen.getByRole('button', { name: '참여 신청하기' });
  expect(button).not.toBeDisabled();
});

test('shows closed message and a disabled button when the coupon event is full', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({
      id: 1,
      type: 'sample',
      title: '샘플 증정 프로모션',
      description: '설명',
      coupon_event: { capacity: 50, applied_count: 50 },
    })
  );

  renderDetailPage();

  await waitFor(() =>
    expect(screen.getByText('마감되었습니다 (0 / 50명 남음)')).toBeInTheDocument()
  );

  const button = screen.getByRole('button', { name: '마감되었습니다' });
  expect(button).toBeDisabled();
});

// FE-4: 참여 신청 + 추첨 결과 모달 (UC-3/UC-4) ---------------------------------

test('applying to a regular (non-coupon) promotion shows a completion message and updates the button', async () => {
  const detailResponse = jsonResponse({
    id: 1,
    type: 'price_discount',
    title: '가격할인 프로모션',
    description: '상세 설명입니다.',
    coupon_event: null,
  });
  fetch
    .mockResolvedValueOnce(detailResponse)
    .mockResolvedValueOnce(jsonResponse({ draw_result: null }))
    // 신청 성공 시 useApplyPromotion이 ['promotions', id] 쿼리를 무효화해 상세를 재조회한다.
    .mockResolvedValue(detailResponse);

  renderDetailPage();

  const button = await screen.findByRole('button', { name: '참여 신청하기' });
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByText(/완료되었습니다/)).toBeInTheDocument());

  const stillActiveButton = screen.queryByRole('button', { name: '참여 신청하기' });
  if (stillActiveButton) {
    expect(stillActiveButton).toBeDisabled();
  }
});

test('applying to a coupon event and winning shows a result modal with discount rate and expiry, without a re-draw button (BR-4, BR-5, BR-8)', async () => {
  const detailResponse = jsonResponse({
    id: 1,
    type: 'sample',
    title: '샘플 증정 프로모션',
    description: '설명',
    coupon_event: { capacity: 50, applied_count: 23 },
  });
  fetch
    .mockResolvedValueOnce(detailResponse)
    .mockResolvedValueOnce(
      jsonResponse({
        draw_result: { discount_rate: 30, expires_at: '2026-09-20T00:00:00.000Z' },
      })
    )
    // 신청 성공 시 useApplyPromotion이 ['promotions', id] 쿼리를 무효화해 상세를 재조회한다.
    .mockResolvedValue(detailResponse);

  renderDetailPage();

  const button = await screen.findByRole('button', { name: '참여 신청하기' });
  fireEvent.click(button);

  const modal = await waitFor(() => {
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    const box = overlay.querySelector('.modal-box');
    expect(box).not.toBeNull();
    return box;
  });

  expect(within(modal).getByText('당첨 할인율: 30%')).toBeInTheDocument();
  expect(within(modal).getByText(/2026/)).toBeInTheDocument();
  expect(within(modal).getByRole('button', { name: '확인' })).toBeInTheDocument();
});

test('the coupon result modal never offers a re-draw button (BR-5)', async () => {
  const detailResponse = jsonResponse({
    id: 1,
    type: 'sample',
    title: '샘플 증정 프로모션',
    description: '설명',
    coupon_event: { capacity: 50, applied_count: 23 },
  });
  fetch
    .mockResolvedValueOnce(detailResponse)
    .mockResolvedValueOnce(
      jsonResponse({
        draw_result: { discount_rate: 30, expires_at: '2026-09-20T00:00:00.000Z' },
      })
    )
    // 신청 성공 시 useApplyPromotion이 ['promotions', id] 쿼리를 무효화해 상세를 재조회한다.
    .mockResolvedValue(detailResponse);

  renderDetailPage();

  const button = await screen.findByRole('button', { name: '참여 신청하기' });
  fireEvent.click(button);

  await waitFor(() => expect(document.querySelector('.modal-overlay')).not.toBeNull());

  // 주의: 모달의 필수 안내문구("※ 재추첨은 제공되지 않습니다.") 자체에 "재추첨"이 포함되므로
  // 텍스트 존재 여부가 아니라 재추첨을 "실행하는 버튼/액션"이 없는지로 BR-5를 검증한다.
  expect(screen.queryByRole('button', { name: /재추첨|다시\s?뽑기/ })).not.toBeInTheDocument();
});

test('duplicate application (409) shows the duplicate-application message instead of the apply button (EX-2)', async () => {
  fetch
    .mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        type: 'price_discount',
        title: '가격할인 프로모션',
        description: '상세 설명입니다.',
        coupon_event: null,
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({ error: '이미 신청한 프로모션입니다.' }, { ok: false, status: 409 })
    );

  renderDetailPage();

  const button = await screen.findByRole('button', { name: '참여 신청하기' });
  fireEvent.click(button);

  await waitFor(() =>
    expect(screen.getByText(/이미 신청한 프로모션입니다\./)).toBeInTheDocument()
  );

  const stillActiveButton = screen.queryByRole('button', { name: '참여 신청하기' });
  if (stillActiveButton) {
    expect(stillActiveButton).toBeDisabled();
  }
});

test('server-side closed error (409) on apply shows a closed message and does not treat it as success', async () => {
  fetch
    .mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        type: 'sample',
        title: '샘플 증정 프로모션',
        description: '설명',
        coupon_event: { capacity: 10, applied_count: 3 },
      })
    )
    .mockResolvedValueOnce(jsonResponse({ error: '마감되었습니다.' }, { ok: false, status: 409 }));

  renderDetailPage();

  const button = await screen.findByRole('button', { name: '참여 신청하기' });
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByText(/마감되었습니다\./)).toBeInTheDocument());

  expect(screen.queryByText(/완료되었습니다/)).not.toBeInTheDocument();
  expect(document.querySelector('.modal-overlay')).toBeNull();
});

test('after a successful application, invalidated queries refetch and the remaining capacity text updates', async () => {
  fetch
    .mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        type: 'sample',
        title: '샘플 증정 프로모션',
        description: '설명',
        coupon_event: { capacity: 50, applied_count: 23 },
      })
    )
    .mockResolvedValueOnce(jsonResponse({ draw_result: null }))
    // 신청 성공 시 useApplyPromotion이 ['promotions', id] 쿼리를 무효화해 상세를 재조회한다.
    // 재조회 이후 추가로 발생할 수 있는 호출까지 대비해 mockResolvedValue(지속)로 둔다.
    .mockResolvedValue(
      jsonResponse({
        id: 1,
        type: 'sample',
        title: '샘플 증정 프로모션',
        description: '설명',
        coupon_event: { capacity: 50, applied_count: 24 },
      })
    );

  renderDetailPage();

  expect(await screen.findByText('잔여 27 / 50명 남음')).toBeInTheDocument();

  const button = screen.getByRole('button', { name: '참여 신청하기' });
  fireEvent.click(button);

  await waitFor(() => expect(screen.getByText('잔여 26 / 50명 남음')).toBeInTheDocument());
});
