import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import SignupPage from './SignupPage';
import { useAuthStore } from '../store/authStore';

function jsonResponse(body, { ok = true, status = ok ? 200 : 400 } = {}) {
  return { ok, status, json: async () => body };
}

function renderSignupPage(initialEntry = '/signup') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const validForm = {
  email: 'new-partner@example.com',
  password: 'pw123456',
  name: '홍길동',
  phone: '010-1234-5678',
  partner_name: 'OO식당',
};

function fillAndSubmit(form = validForm) {
  fireEvent.change(screen.getByLabelText(/이메일/), { target: { value: form.email } });
  fireEvent.change(screen.getByLabelText(/비밀번호/), { target: { value: form.password } });
  fireEvent.change(screen.getByLabelText(/이름/), { target: { value: form.name } });
  fireEvent.change(screen.getByLabelText(/전화번호/), { target: { value: form.phone } });
  fireEvent.change(screen.getByLabelText(/거래처명/), { target: { value: form.partner_name } });
  fireEvent.click(screen.getByRole('button', { name: /가입하기/ }));
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  global.fetch = vi.fn();
});

test('signup success posts SignupRequest shape and navigates to /login (UC-1 완료조건 1 전반부)', async () => {
  fetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { status: 201 }));

  renderSignupPage();
  fillAndSubmit();

  await waitFor(() => expect(screen.getByText('Login Screen')).toBeInTheDocument());

  const [, options] = fetch.mock.calls[0];
  expect(JSON.parse(options.body)).toEqual(validForm);
});

test('signup failure (duplicate email) renders server error message and stays on SignupPage', async () => {
  fetch.mockResolvedValueOnce(
    jsonResponse({ error: '이미 가입된 이메일입니다.' }, { ok: false, status: 409 })
  );

  renderSignupPage();
  fillAndSubmit();

  expect(await screen.findByText('이미 가입된 이메일입니다.')).toBeInTheDocument();
  expect(screen.getByLabelText(/이메일/)).toBeInTheDocument();
});

test('login link navigates to /login', () => {
  renderSignupPage();
  fireEvent.click(screen.getByRole('link', { name: /로그인/ }));
  expect(screen.getByText('Login Screen')).toBeInTheDocument();
});

// 완료조건 7(375px) 자동화 한계는 LoginPage.test.jsx 참고 주석과 동일
test('signup form container uses the shared responsive auth-page layout class', () => {
  const { container } = renderSignupPage();
  expect(container.querySelector('.auth-page')).not.toBeNull();
});
