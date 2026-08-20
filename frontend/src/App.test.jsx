import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import App, { ProtectedRoute } from './App';
import { useAuthStore } from './store/authStore';

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
});

function renderProtected(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>secret</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

test('ProtectedRoute redirects to /login when there is no accessToken', () => {
  renderProtected();

  expect(screen.queryByText('secret')).not.toBeInTheDocument();
  expect(screen.getByText('Login Screen')).toBeInTheDocument();
});

test('ProtectedRoute renders children when accessToken is present', () => {
  useAuthStore.setState({ accessToken: 'valid-token' });
  renderProtected();

  expect(screen.getByText('secret')).toBeInTheDocument();
});

test('App mounts without throwing', () => {
  expect(() => render(<App />)).not.toThrow();
});

test('App renders PromotionListPage at / when logged in', () => {
  window.history.pushState({}, '', '/');
  useAuthStore.setState({ accessToken: 'valid-token' });
  render(<App />);

  // usePromotions()의 실제 API 응답 상태(로딩/성공/에러)와 무관하게 항상 렌더링되는
  // 페이지 제목으로 확인한다(FE-3: PromotionListPage로 교체됨).
  expect(screen.getByText('진행 중인 프로모션')).toBeInTheDocument();
});

test('ProtectedRoute redirects to / when role is required and the user has a different role', () => {
  useAuthStore.setState({ accessToken: 'valid-token', user: { role: 'partner' } });
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route
          path="/secret"
          element={
            <ProtectedRoute role="admin">
              <div>secret</div>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<div>Home Screen</div>} />
      </Routes>
    </MemoryRouter>
  );

  expect(screen.queryByText('secret')).not.toBeInTheDocument();
  expect(screen.getByText('Home Screen')).toBeInTheDocument();
});

// 완료조건 7 (UC-6/UC-7): 거래처 담당자 계정으로 관리자 URL(/admin) 직접 접근 시 차단되고
// 파트너 홈(PromotionListPage)으로 리다이렉트된다.
test('a partner account visiting /admin is redirected to the partner home (PromotionListPage)', () => {
  window.history.pushState({}, '', '/admin');
  useAuthStore.setState({
    accessToken: 'valid-token',
    user: { id: 1, email: 'partner@example.com', role: 'partner' },
  });
  render(<App />);

  expect(screen.queryByText('관리자 프로모션 목록')).not.toBeInTheDocument();
  expect(screen.getByText('진행 중인 프로모션')).toBeInTheDocument();
});
