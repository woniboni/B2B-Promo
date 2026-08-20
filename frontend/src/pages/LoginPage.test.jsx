import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import LoginPage from './LoginPage';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

// 실제 PromotionListPage/AdminPromotionListPage(다른 에이전트가 구현 중)에 의존하지 않도록
// App.test.jsx의 ProtectedRoute 테스트와 동일한 패턴으로 목적지에 임시 화면을 붙여 네비게이션만 확인한다.
function renderLoginPage(initialEntry = '/login') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>PromotionList Screen</div>} />
          <Route path="/admin" element={<div>AdminPromotionList Screen</div>} />
          <Route path="/signup" element={<div>Signup Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function fillAndSubmit({ email, password }) {
  fireEvent.change(screen.getByLabelText(/이메일/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/비밀번호/), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  global.fetch = vi.fn();
});

test('partner login success stores tokens in authStore and navigates to / (PromotionListPage)', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      user: { id: 1, email: 'partner@example.com', role: 'partner' },
    })
  );

  renderLoginPage();
  fillAndSubmit({ email: 'partner@example.com', password: 'pw1234' });

  await waitFor(() => expect(screen.getByText('PromotionList Screen')).toBeInTheDocument());

  expect(useAuthStore.getState().accessToken).toBe('access-1');
  expect(useAuthStore.getState().refreshToken).toBe('refresh-1');
});

test('admin login success navigates to /admin (AdminPromotionListPage)', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      user: { id: 2, email: 'admin@example.com', role: 'admin' },
    })
  );

  renderLoginPage();
  fillAndSubmit({ email: 'admin@example.com', password: 'pw1234' });

  await waitFor(() => expect(screen.getByText('AdminPromotionList Screen')).toBeInTheDocument());
});

test('login failure renders the exact Korean error message and stays on LoginPage', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { ok: false, status: 401 })
  );

  renderLoginPage();
  fillAndSubmit({ email: 'partner@example.com', password: 'wrong-pw' });

  expect(await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
  expect(screen.getByLabelText(/이메일/)).toBeInTheDocument();
  expect(useAuthStore.getState().accessToken).toBeNull();
});

test('signup link navigates to /signup', () => {
  renderLoginPage();
  fireEvent.click(screen.getByRole('link', { name: /회원가입/ }));
  expect(screen.getByText('Signup Screen')).toBeInTheDocument();
});

// 완료조건 7(375px)의 자동화 한계: jsdom은 실제 레이아웃/가로 스크롤을 계산하지 않으므로
// 여기서는 공용 반응형 클래스(auth-page, frontend/src/pages/auth.css)가 적용됐는지만 확인한다.
test('login form container uses the shared responsive auth-page layout class', () => {
  const { container } = renderLoginPage();
  expect(container.querySelector('.auth-page')).not.toBeNull();
});
