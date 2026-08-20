import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import PromotionListPage from './PromotionListPage';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

const withCoupon = {
  id: 1,
  type: 'sample',
  title: '샘플 증정 프로모션',
  description: '설명1',
  coupon_event: { capacity: 50, applied_count: 23 },
};

const withoutCoupon = {
  id: 2,
  type: 'price_discount',
  title: '가격할인 프로모션',
  description: '설명2',
  coupon_event: null,
};

function renderPage(initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<PromotionListPage />} />
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/promotions/:id" element={<div>PromotionDetail Screen</div>} />
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

// 완료조건 1/2: 백엔드가 이미 게시된 프로모션만 필터링해서 내려준다는 전제 하에,
// 프론트는 API 응답에 있는 항목을 빠짐없이 그대로 렌더링하는지만 검증한다.
// (임시저장/종료 건은 애초에 응답에 없으므로 "안 보인다"는 이 mock 구성 자체로 보장됨 —
//  프론트가 스스로 상태를 걸러내는 로직은 없고 검증 대상도 아니다.)
test('renders every promotion returned by the API, with coupon badge/remaining only on the coupon card', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([withCoupon, withoutCoupon]));

  renderPage();

  expect(await screen.findByText('샘플 증정 프로모션')).toBeInTheDocument();
  expect(screen.getByText('가격할인 프로모션')).toBeInTheDocument();
  expect(screen.getByText('샘플증정')).toBeInTheDocument();
  expect(screen.getByText('가격할인')).toBeInTheDocument();

  expect(screen.getByText('쿠폰이벤트')).toBeInTheDocument();
  expect(screen.getByText('잔여 27/50명')).toBeInTheDocument();

  // 쿠폰 없는 카드에는 쿠폰 배지가 하나뿐(있는 카드 것)임을 확인
  expect(screen.getAllByText('쿠폰이벤트')).toHaveLength(1);
});

test('clicking a promotion card navigates to /promotions/:id', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([withCoupon]));

  renderPage();

  fireEvent.click(await screen.findByText('샘플 증정 프로모션'));

  expect(screen.getByText('PromotionDetail Screen')).toBeInTheDocument();
});

test('promotion list container uses the .promotion-grid layout class', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([withCoupon]));

  const { container } = renderPage();

  await waitFor(() => expect(screen.getByText('샘플 증정 프로모션')).toBeInTheDocument());
  expect(container.querySelector('.promotion-grid')).not.toBeNull();
});

// 완료조건 5: 로그아웃 시 저장된 두 토큰이 모두 제거되고 로그인 화면으로 이동한다
test('logout button clears both tokens from authStore and navigates to /login', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([]));

  renderPage();

  fireEvent.click(screen.getByRole('button', { name: /로그아웃/ }));

  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(useAuthStore.getState().refreshToken).toBeNull();
  expect(screen.getByText('Login Screen')).toBeInTheDocument();
});

// FE-5: 헤더에 "내 신청 목록" 링크가 로그아웃 버튼보다 앞에 추가된다
test('header shows a "내 신청 목록" link to /applications/me', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([]));

  renderPage();

  const link = await screen.findByRole('link', { name: '내 신청 목록' });
  expect(link).toHaveAttribute('href', '/applications/me');
});

// FE-8: 헤더에 "마이페이지" 링크가 추가된다
test('header shows a "마이페이지" link to /mypage', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([]));

  renderPage();

  const link = await screen.findByRole('link', { name: '마이페이지' });
  expect(link).toHaveAttribute('href', '/mypage');
});

// 완료조건 7: 서버 데이터(프로모션 목록)는 TanStack Query 캐시에만 보관되고
// authStore(Zustand)에는 세션 관련 필드만 남아야 한다.
test('rendering the promotion list does not add any field to authStore', async () => {
  fetch.mockResolvedValueOnce(jsonResponse([withCoupon, withoutCoupon]));

  renderPage();

  await screen.findByText('샘플 증정 프로모션');

  expect(Object.keys(useAuthStore.getState()).sort()).toEqual(
    ['accessToken', 'logout', 'refreshToken', 'setTokens', 'setUser', 'user'].sort()
  );
});
