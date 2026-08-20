import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import MyApplicationsPage from './MyApplicationsPage';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

// (a) 신청됨 + 쿠폰이벤트 당첨(draw_result 있음) — 조건2
const applicationA = {
  id: 1,
  promotion_id: 101,
  partner_id: 1,
  status: 'applied',
  applied_at: '2026-08-01T00:00:00.000Z',
  canceled_at: null,
  promotion: {
    id: 101,
    title: '쿠폰 당첨 프로모션',
    type: 'sample',
    description: '설명A',
    status: 'active',
    coupon_event: { capacity: 50, applied_count: 23 },
  },
  draw_result: { discount_rate: 30, confirmed_at: '2026-08-01T00:00:00.000Z', expires_at: '2026-09-20T00:00:00.000Z' },
};

// (b) 취소됨 + 진행 중인 프로모션 — 재신청 버튼 노출 대상 (조건4/5/6)
const applicationB = {
  id: 2,
  promotion_id: 102,
  partner_id: 1,
  status: 'canceled',
  applied_at: '2026-07-01T00:00:00.000Z',
  canceled_at: '2026-07-10T00:00:00.000Z',
  promotion: {
    id: 102,
    title: '재신청 대상 프로모션',
    type: 'price_discount',
    description: '설명B',
    status: 'active',
    coupon_event: null,
  },
  draw_result: null,
};

// (c) 신청됨 + 종료된 프로모션 — [종료된 프로모션] 태그, 취소 버튼은 있음 (조건7)
const applicationC = {
  id: 3,
  promotion_id: 103,
  partner_id: 1,
  status: 'applied',
  applied_at: '2026-06-01T00:00:00.000Z',
  canceled_at: null,
  promotion: {
    id: 103,
    title: '종료된 진행중 신청 프로모션',
    type: 'tasting',
    description: '설명C',
    status: 'closed',
    coupon_event: null,
  },
  draw_result: null,
};

// (d) 취소됨 + 종료된 프로모션 — 재신청 버튼 없음 (조건7)
const applicationD = {
  id: 4,
  promotion_id: 104,
  partner_id: 1,
  status: 'canceled',
  applied_at: '2026-05-01T00:00:00.000Z',
  canceled_at: '2026-05-10T00:00:00.000Z',
  promotion: {
    id: 104,
    title: '종료된 취소 프로모션',
    type: 'bogo',
    description: '설명D',
    status: 'closed',
    coupon_event: null,
  },
  draw_result: null,
};

const allApplications = [applicationA, applicationB, applicationC, applicationD];

function renderPage(initialEntry = '/applications/me') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/applications/me" element={<MyApplicationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// title 텍스트를 포함하는 카드 컨테이너를 찾아 그 범위 안에서만 assertion 하기 위한 헬퍼.
// 정확한 클래스명은 구현체 재량이므로 "card"를 포함하는 클래스를 가진 가장 가까운 조상을 카드로 간주한다.
async function getCardByTitle(title) {
  const titleEl = await screen.findByText(title);
  const card = titleEl.closest('[class*="card"]');
  expect(card).not.toBeNull();
  return card;
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 1, email: 'partner@example.com', role: 'partner' },
  });
  global.fetch = vi.fn();
});

// 조건1: 신청됨/취소됨 건이 모두 목록에 표시되고 상태가 시각적으로 구분된다
test('renders both applied and canceled applications with visually distinct status', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allApplications));

  renderPage();

  expect(await screen.findByText('쿠폰 당첨 프로모션')).toBeInTheDocument();
  expect(screen.getByText('재신청 대상 프로모션')).toBeInTheDocument();
  expect(screen.getByText('종료된 진행중 신청 프로모션')).toBeInTheDocument();
  expect(screen.getByText('종료된 취소 프로모션')).toBeInTheDocument();

  const appliedBadges = screen.getAllByText('신청됨');
  const canceledBadges = screen.getAllByText('취소됨');
  expect(appliedBadges).toHaveLength(2);
  expect(canceledBadges).toHaveLength(2);

  // 시각적 구분: 신청됨/취소됨 뱃지의 class가 서로 달라야 한다.
  expect(appliedBadges[0].className).toBeTruthy();
  expect(canceledBadges[0].className).toBeTruthy();
  expect(appliedBadges[0].className).not.toBe(canceledBadges[0].className);
});

// 조건2 (BR-8): 쿠폰 이벤트 당첨 건에 할인율과 만료일이 표시된다
test('shows discount rate and expiry date for a winning coupon-event application', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allApplications));

  renderPage();

  const cardA = await getCardByTitle('쿠폰 당첨 프로모션');
  expect(within(cardA).getByText(/당첨.*30\s*%/)).toBeInTheDocument();
  expect(within(cardA).getByText(/2026/)).toBeInTheDocument();
});

// 조건3: "취소하기" 클릭 시 상태가 취소됨으로 바뀌고 목록이 갱신된다
test('clicking cancel on an applied item flips it to canceled after refetch', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(allApplications))
    // PATCH /applications/1/cancel
    .mockResolvedValueOnce(jsonResponse({ id: 1, status: 'canceled' }))
    // useCancelApplication의 onSuccess가 ['applications','me']를 무효화해 재조회한다.
    // 재조회 이후 추가로 발생할 수 있는 호출까지 대비해 mockResolvedValue(지속형)로 둔다.
    .mockResolvedValue(
      jsonResponse([{ ...applicationA, status: 'canceled', canceled_at: '2026-08-15T00:00:00.000Z' }, applicationB, applicationC, applicationD])
    );

  renderPage();

  const cardA = await getCardByTitle('쿠폰 당첨 프로모션');
  fireEvent.click(within(cardA).getByRole('button', { name: '취소하기' }));

  // application.id는 그대로이므로(key 불변) 같은 카드 DOM 노드가 재사용된다는 전제로 검증한다.
  await waitFor(() => expect(within(cardA).getByText('취소됨')).toBeInTheDocument());
});

// 조건4, 5 (BR-3): 취소됨 건에 재신청하기 클릭 시 재신청되어 상태가 신청됨으로 돌아오고,
// 새 카드가 추가되는 게 아니라 기존 카드(같은 4건)의 상태만 바뀐다.
test('reapplying to a canceled (still open) application flips it back to applied without adding a new card', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(allApplications))
    // POST /promotions/102/apply (재신청)
    .mockResolvedValueOnce(jsonResponse({ id: 2, promotion_id: 102, status: 'applied', draw_result: null }, { status: 201 }))
    // useApplyPromotion의 onSuccess가 ['applications','me']를 무효화해 재조회한다.
    .mockResolvedValue(
      jsonResponse([applicationA, { ...applicationB, status: 'applied', canceled_at: null }, applicationC, applicationD])
    );

  renderPage();

  const cardB = await getCardByTitle('재신청 대상 프로모션');
  fireEvent.click(within(cardB).getByRole('button', { name: '재신청하기' }));

  await waitFor(() => expect(within(cardB).getByText('신청됨')).toBeInTheDocument());

  // 카드 개수는 여전히 4개(재신청 대상 프로모션 타이틀도 여전히 1개)
  expect(screen.getAllByText('재신청 대상 프로모션')).toHaveLength(1);
  expect(screen.getByText('쿠폰 당첨 프로모션')).toBeInTheDocument();
  expect(screen.getByText('종료된 진행중 신청 프로모션')).toBeInTheDocument();
  expect(screen.getByText('종료된 취소 프로모션')).toBeInTheDocument();
  expect(screen.getAllByText('신청됨')).toHaveLength(3);
  expect(screen.getAllByText('취소됨')).toHaveLength(1);
});

// 조건6 (EX-4): 쿠폰 이벤트 마감 상태에서 재신청 시 "마감되었습니다" 안내가 표시된다
test('reapplying when the coupon event has since closed shows a closed message on that card', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(allApplications))
    .mockResolvedValueOnce(jsonResponse({ error: '마감되었습니다.' }, { ok: false, status: 409 }));

  renderPage();

  const cardB = await getCardByTitle('재신청 대상 프로모션');
  fireEvent.click(within(cardB).getByRole('button', { name: '재신청하기' }));

  await waitFor(() => expect(within(cardB).getByText(/마감되었습니다/)).toBeInTheDocument());

  // 재신청 실패이므로 상태는 여전히 취소됨으로 남아 있어야 한다.
  expect(within(cardB).getByText('취소됨')).toBeInTheDocument();
});

// 조건7 (BR-11, EX-3): 종료된 프로모션 건에 [종료된 프로모션] 태그가 표시되고 재신청 버튼은 노출되지 않는다.
// (조건8: closed 프로모션 신청 건이 이 화면에 여전히 노출되는지는 이 mock 데이터 구성(applicationC/D 포함) 자체로
//  이미 검증된다. GET /applications/me는 promotions 목록 API와 별개 엔드포인트라 "목록 화면엔 없어야 한다"는
//  요건이 이 페이지의 프론트 로직과 무관하게 구조적으로 보장되므로 별도 케이스를 추가하지 않는다.)
test('closed-promotion applications show a closed tag; the canceled+closed one has no reapply button', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allApplications));

  renderPage();

  const cardC = await getCardByTitle('종료된 진행중 신청 프로모션');
  const cardD = await getCardByTitle('종료된 취소 프로모션');

  expect(within(cardC).getByText('[종료된 프로모션]')).toBeInTheDocument();
  expect(within(cardD).getByText('[종료된 프로모션]')).toBeInTheDocument();

  // (c)는 신청됨 상태이므로 취소하기 버튼은 있다.
  expect(within(cardC).getByRole('button', { name: '취소하기' })).toBeInTheDocument();

  // (d)는 취소됨 + 종료된 프로모션이므로 재신청 버튼이 없어야 한다.
  expect(within(cardD).queryByRole('button', { name: '재신청하기' })).not.toBeInTheDocument();
});
