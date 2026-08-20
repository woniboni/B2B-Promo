import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import MyPage from './MyPage';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

const me = {
  id: 1,
  email: 'partner@example.com',
  role: 'partner',
  name: '홍길동',
  phone: '010-1111-2222',
};

function renderPage(initialEntry = '/mypage') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/" element={<div>파트너 홈</div>} />
          <Route path="/admin" element={<div>관리자 홈</div>} />
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

// 완료조건 1: 내 정보(이메일·이름·전화번호)가 조회된다
test('loads and displays email, name, and phone', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(me));

  renderPage();

  await waitFor(() => expect(screen.getByText('partner@example.com')).toBeInTheDocument());
  expect(screen.getByLabelText('이름')).toHaveValue('홍길동');
  expect(screen.getByLabelText('전화번호')).toHaveValue('010-1111-2222');
});

// 완료조건 2: 이름·전화번호 수정이 저장되고 화면에 반영된다
test('saving name/phone PATCHes /users/me and shows a success message', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(me))
    .mockResolvedValueOnce(jsonResponse({ ...me, name: '김철수', phone: '010-9999-8888' }));

  renderPage();
  await waitFor(() => expect(screen.getByLabelText('이름')).toHaveValue('홍길동'));

  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '김철수' } });
  fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: '010-9999-8888' } });
  fireEvent.click(screen.getByRole('button', { name: '정보 저장' }));

  await waitFor(() => {
    const [url, options] = fetch.mock.calls[1];
    expect(url).toContain('/users/me');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ name: '김철수', phone: '010-9999-8888' });
  });

  expect(await screen.findByText('정보가 저장되었습니다.')).toBeInTheDocument();
});

// 완료조건 3: 비밀번호 변경 성공 시 안내 메시지가 표시된다(재로그인 성공 여부는 실제 계정으로 별도 실측)
test('changing the password PATCHes /users/me/password and shows the success message', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(me))
    .mockResolvedValueOnce(jsonResponse({ message: '비밀번호가 변경되었습니다.' }));

  renderPage();
  await waitFor(() => expect(screen.getByLabelText('이름')).toHaveValue('홍길동'));

  fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'oldpass1' } });
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'newpass123' } });
  fireEvent.click(screen.getByRole('button', { name: '변경하기' }));

  await waitFor(() => {
    const [url, options] = fetch.mock.calls[1];
    expect(url).toContain('/users/me/password');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ current_password: 'oldpass1', new_password: 'newpass123' });
  });

  expect(await screen.findByText('비밀번호가 변경되었습니다.')).toBeInTheDocument();
});

test('shows the backend error message when saving the profile fails', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(me))
    .mockResolvedValueOnce(jsonResponse({ error: '저장에 실패했습니다.' }, { ok: false, status: 500 }));

  renderPage();
  await waitFor(() => expect(screen.getByLabelText('이름')).toHaveValue('홍길동'));

  fireEvent.click(screen.getByRole('button', { name: '정보 저장' }));

  expect(await screen.findByText('저장에 실패했습니다.')).toBeInTheDocument();
});

// 현재 비밀번호 불일치 시 에러 메시지가 표시된다
test('shows the backend error message when the current password is wrong', async () => {
  fetch
    .mockResolvedValueOnce(jsonResponse(me))
    .mockResolvedValueOnce(jsonResponse({ error: '현재 비밀번호가 올바르지 않습니다.' }, { ok: false, status: 400 }));

  renderPage();
  await waitFor(() => expect(screen.getByLabelText('이름')).toHaveValue('홍길동'));

  fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'wrongpass' } });
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'newpass123' } });
  fireEvent.click(screen.getByRole('button', { name: '변경하기' }));

  expect(await screen.findByText('현재 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
});

// 완료조건 4: 관리자 계정으로도 접근 가능하며, "뒤로" 링크가 역할에 맞는 목록으로 이동한다
test('admin users see a back link to /admin, partners see a back link to /', async () => {
  fetch.mockResolvedValueOnce(jsonResponse(me));
  renderPage();
  await waitFor(() =>
    expect(screen.getByRole('link', { name: '← 뒤로' })).toHaveAttribute('href', '/')
  );

  useAuthStore.setState({ user: { id: 2, email: 'admin@example.com', role: 'admin' } });
  fetch.mockResolvedValueOnce(jsonResponse({ ...me, email: 'admin@example.com' }));
  renderPage();
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: '← 뒤로' }).some((el) => el.getAttribute('href') === '/admin')).toBe(
      true
    )
  );
});

test('shows an error message when loading my info fails', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ error: '실패' }, { ok: false, status: 500 }));

  renderPage();

  expect(await screen.findByText('내 정보를 불러오지 못했습니다.')).toBeInTheDocument();
});
