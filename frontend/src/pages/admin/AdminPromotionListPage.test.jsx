import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import AdminPromotionListPage from './AdminPromotionListPage';
import { useAuthStore } from '../../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

const draftPromo = {
  id: 1,
  title: '임시저장 프로모션',
  type: 'sample',
  description: '설명A',
  status: 'draft',
  coupon_event: null,
};

const publishedPromo = {
  id: 2,
  title: '게시된 쿠폰이벤트 프로모션',
  type: 'tasting',
  description: '설명B',
  status: 'published',
  coupon_event: { capacity: 50, applied_count: 12 },
};

const closedPromo = {
  id: 3,
  title: '종료된 프로모션',
  type: 'bogo',
  description: '설명C',
  status: 'closed',
  coupon_event: null,
};

const allPromotions = [draftPromo, publishedPromo, closedPromo];

function renderPage(initialEntry = '/admin') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin" element={<AdminPromotionListPage />} />
          <Route path="/admin/promotions/new" element={<div>등록 화면</div>} />
          <Route path="/admin/promotions/:id/edit" element={<div>수정 화면</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// title 텍스트를 포함하는 행/카드 컨테이너를 찾아 그 범위 안에서만 assertion 하기 위한 헬퍼.
// 데스크탑 테이블(행/tr)과 모바일 카드가 동시에 DOM에 존재하므로, 같은 title이 두 곳에서
// 발견된다. getAllByText로 모든 매치를 받아 각각의 가장 가까운 tr 또는 카드 조상을 반환한다.
function getRowsByTitle(title) {
  const titleEls = screen.getAllByText(title);
  return titleEls.map((el) => el.closest('tr') || el.closest('[class*="card"]')).filter(Boolean);
}

async function waitForTitle(title) {
  await waitFor(() => expect(screen.getAllByText(title).length).toBeGreaterThan(0));
}

beforeEach(() => {
  useAuthStore.setState({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 1, email: 'admin@example.com', role: 'admin' },
  });
  global.fetch = vi.fn();
});

// 완료조건 1: 임시저장/게시됨/종료됨 프로모션이 모두 상태와 함께 표시된다
test('renders draft, published, and closed promotions each with their status label', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allPromotions));

  renderPage();
  await waitForTitle('임시저장 프로모션');

  expect(screen.getAllByText('게시된 쿠폰이벤트 프로모션').length).toBeGreaterThan(0);
  expect(screen.getAllByText('종료된 프로모션').length).toBeGreaterThan(0);

  // 데스크탑 테이블 + 모바일 카드가 동시에 렌더링되므로 각 상태 텍스트는 최소 1개 이상 존재해야 한다.
  expect(screen.getAllByText('임시저장').length).toBeGreaterThan(0);
  expect(screen.getAllByText('게시됨').length).toBeGreaterThan(0);
  expect(screen.getAllByText('종료됨').length).toBeGreaterThan(0);
});

// 쿠폰이벤트 요약 텍스트: coupon_event 있으면 applied_count/capacity, 없으면 '-'
test('shows applied_count/capacity for coupon-event promotions and "-" otherwise', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allPromotions));

  renderPage();
  await waitForTitle('게시된 쿠폰이벤트 프로모션');

  expect(screen.getAllByText('12/50').length).toBeGreaterThan(0);

  const draftRows = getRowsByTitle('임시저장 프로모션');
  expect(draftRows.length).toBeGreaterThan(0);
  draftRows.forEach((row) => expect(within(row).getByText('-')).toBeInTheDocument());
});

// 반응형 레이아웃: 데스크탑 테이블과 모바일 카드 목록이 함께 DOM에 존재한다
test('renders both a desktop table and a mobile card list', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allPromotions));

  renderPage();
  await waitForTitle('임시저장 프로모션');

  expect(document.querySelector('.admin-table')).not.toBeNull();
  expect(document.querySelector('.admin-card-list')).not.toBeNull();
});

test('"+ 새 프로모션 등록" links to /admin/promotions/new', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allPromotions));

  renderPage();
  await waitForTitle('임시저장 프로모션');

  const links = screen.getAllByRole('link', { name: '+ 새 프로모션 등록' });
  expect(links.length).toBeGreaterThan(0);
  links.forEach((link) => expect(link).toHaveAttribute('href', '/admin/promotions/new'));
});

// 완료조건 2 (BR-9) 일부: draft 건에서 "게시" 클릭 시 PATCH가 호출되고, 재조회 후 상태가
// "게시됨"으로 바뀐다. 이 mutation이 ['promotions']까지 무효화 대상에 포함한다는 것은
// adminPromotions.test.js에서 별도로 검증했으므로, 여기서는 화면 갱신 자체를 확인한다.
test('clicking "게시" on a draft promotion PATCHes status=published and the row updates after refetch', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(allPromotions))
    .mockResolvedValueOnce(jsonResponse({ ...draftPromo, status: 'published' }))
    .mockResolvedValue(
      jsonResponse([{ ...draftPromo, status: 'published' }, publishedPromo, closedPromo])
    );

  renderPage();
  await waitForTitle('임시저장 프로모션');

  const publishButtons = screen.getAllByRole('button', { name: '게시' });
  fireEvent.click(publishButtons[0]);

  await waitFor(() => {
    const [url, options] = fetch.mock.calls[1];
    expect(url).toContain('/admin/promotions/1/status');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ status: 'published' });
  });

  await waitFor(() => {
    const rows = getRowsByTitle('임시저장 프로모션');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(within(row).getByText('게시됨')).toBeInTheDocument());
  });
});

// 완료조건 3 (BR-10) 일부: published 건에서 "종료" 클릭 시 PATCH가 호출되고, 재조회 후
// 상태가 "종료됨"으로 바뀐다.
test('clicking "종료" on a published promotion PATCHes status=closed and the row updates after refetch', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(allPromotions))
    .mockResolvedValueOnce(jsonResponse({ ...publishedPromo, status: 'closed' }))
    .mockResolvedValue(
      jsonResponse([draftPromo, { ...publishedPromo, status: 'closed' }, closedPromo])
    );

  renderPage();
  await waitForTitle('게시된 쿠폰이벤트 프로모션');

  const closeButtons = screen.getAllByRole('button', { name: '종료' });
  fireEvent.click(closeButtons[0]);

  await waitFor(() => {
    const [url, options] = fetch.mock.calls[1];
    expect(url).toContain('/admin/promotions/2/status');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ status: 'closed' });
  });

  await waitFor(() => {
    const rows = getRowsByTitle('게시된 쿠폰이벤트 프로모션');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(within(row).getByText('종료됨')).toBeInTheDocument());
  });
});

test('draft and published rows have a "수정" edit link; closed rows do not', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allPromotions));

  renderPage();
  await waitForTitle('임시저장 프로모션');

  const draftRows = getRowsByTitle('임시저장 프로모션');
  draftRows.forEach((row) => {
    expect(within(row).getByRole('link', { name: '수정' })).toHaveAttribute(
      'href',
      '/admin/promotions/1/edit'
    );
  });

  const publishedRows = getRowsByTitle('게시된 쿠폰이벤트 프로모션');
  publishedRows.forEach((row) => {
    expect(within(row).getByRole('link', { name: '수정' })).toHaveAttribute(
      'href',
      '/admin/promotions/2/edit'
    );
  });

  const closedRows = getRowsByTitle('종료된 프로모션');
  closedRows.forEach((row) => {
    expect(within(row).queryByRole('link', { name: '수정' })).not.toBeInTheDocument();
  });
});

// closed 건에는 게시/종료 버튼이 없고 "현황" 버튼만 있다 (FE-7 몫이라 onClick 없음)
test('closed rows have no 게시/종료 buttons, only a 현황 button', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(allPromotions));

  renderPage();
  await waitForTitle('종료된 프로모션');

  const closedRows = getRowsByTitle('종료된 프로모션');
  closedRows.forEach((row) => {
    expect(within(row).queryByRole('button', { name: '게시' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: '종료' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '현황' })).toBeInTheDocument();
  });
});
