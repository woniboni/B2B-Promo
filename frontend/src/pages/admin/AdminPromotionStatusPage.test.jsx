import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import AdminPromotionStatusPage from './AdminPromotionStatusPage';
import { useAuthStore } from '../../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

const promotion = {
  id: 2,
  title: '신제품 런칭 1+1',
  type: 'bogo',
  description: '설명',
  status: 'published',
  coupon_event: { capacity: 50, applied_count: 27 },
};

const couponSummary = {
  promotion_id: 2,
  applied_status_count: 20,
  canceled_count: 7,
  coupon_event: { capacity: 50, applied_count: 27 },
  discount_distribution: { 5: 9, 10: 8, 15: 6, 20: 4 },
  applications: [
    { partner_name: 'OO식당', status: 'applied', applied_at: '2026-08-01T00:00:00.000Z', discount_rate: 10 },
    { partner_name: 'XX급식', status: 'canceled', applied_at: '2026-08-02T00:00:00.000Z', discount_rate: 5 },
  ],
};

const noCouponSummary = {
  promotion_id: 3,
  applied_status_count: 1,
  canceled_count: 0,
  coupon_event: null,
  discount_distribution: { 5: 0, 10: 0, 15: 0, 20: 0 },
  applications: [{ partner_name: 'ZZ마트', status: 'applied', applied_at: '2026-08-03T00:00:00.000Z', discount_rate: null }],
};

function renderPage(initialEntry = '/admin/promotions/2/applications') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin" element={<div>목록 화면</div>} />
          <Route path="/admin/promotions/:id/applications" element={<AdminPromotionStatusPage />} />
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

// 완료조건 1: 신청됨/취소됨 건수가 구분되어 표시된다
test('shows applied and canceled counts', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() => expect(screen.getByText(/신청됨: 20건/)).toBeInTheDocument());
  expect(screen.getByText(/취소됨: 7건/)).toBeInTheDocument();
  expect(screen.getByText(/합계 27건/)).toBeInTheDocument();
});

// 완료조건 2: 쿠폰 이벤트 프로모션에서 applied_count/capacity가 표시된다
test('shows coupon event applied_count / capacity', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() => expect(screen.getByText(/27 \/ 50/)).toBeInTheDocument());
});

// 완료조건 3: 할인율별 당첨 분포가 표시된다
test('shows discount rate distribution', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() => expect(screen.getByText(/5%: 9건/)).toBeInTheDocument());
  expect(screen.getByText(/10%: 8건/)).toBeInTheDocument();
  expect(screen.getByText(/15%: 6건/)).toBeInTheDocument();
  expect(screen.getByText(/20%: 4건/)).toBeInTheDocument();
});

// 완료조건 4: 신청 거래처 목록(거래처명·상태·신청일시·당첨 할인율)이 표시된다
test('shows applicant list with name, status, applied date, and discount rate', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() => expect(screen.getAllByText('OO식당').length).toBeGreaterThan(0));
  expect(screen.getAllByText('XX급식').length).toBeGreaterThan(0);
  expect(screen.getAllByText('신청됨').length).toBeGreaterThan(0);
  expect(screen.getAllByText('취소됨').length).toBeGreaterThan(0);
  expect(screen.getAllByText('10%').length).toBeGreaterThan(0);
  expect(screen.getAllByText('5%').length).toBeGreaterThan(0);
});

// 쿠폰 이벤트가 없는 프로모션은 정원/할인율 분포 섹션을 표시하지 않고, 당첨 할인율은 '-'로 표시된다
test('promotions without a coupon event omit capacity/distribution sections and show "-" for discount rate', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse({ ...promotion, id: 3, coupon_event: null, status: 'closed' }))
    .mockResolvedValueOnce(jsonResponse(noCouponSummary));

  renderPage('/admin/promotions/3/applications');

  await waitFor(() => expect(screen.getAllByText('ZZ마트').length).toBeGreaterThan(0));
  expect(screen.queryByText(/쿠폰 이벤트 정원 현황/)).not.toBeInTheDocument();
  expect(screen.queryByText(/할인율별 당첨 분포/)).not.toBeInTheDocument();
  expect(screen.getAllByText('-').length).toBeGreaterThan(0);
});

// 제목/유형/상태가 헤더에 표시된다
test('shows the promotion title, type label, and status in the header', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() =>
    expect(screen.getByText('참여 현황: 신제품 런칭 1+1 (1+1 / 게시됨)')).toBeInTheDocument()
  );
});

// "목록으로" 링크는 /admin으로 이동한다
test('"목록으로" link navigates back to /admin', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() => expect(screen.getByRole('link', { name: '← 목록으로' })).toHaveAttribute('href', '/admin'));
});

test('renders both a desktop table and a mobile card list for the applicant list', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse(couponSummary));

  renderPage();

  await waitFor(() => expect(document.querySelector('.admin-table')).not.toBeNull());
  expect(document.querySelector('.admin-card-list')).not.toBeNull();
});

test('shows an error message when the summary request fails', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(promotion)).mockResolvedValueOnce(jsonResponse({ error: '실패' }, { ok: false, status: 500 }));

  renderPage();

  await waitFor(() => expect(screen.getByText('참여 현황을 불러오지 못했습니다.')).toBeInTheDocument());
});
