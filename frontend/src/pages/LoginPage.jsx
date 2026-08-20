import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLogin } from '../api/auth';
import './auth.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const loginMutation = useLogin();

  function handleSubmit(e) {
    e.preventDefault();
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: (data) => {
          navigate(data.user.role === 'admin' ? '/admin' : '/');
        },
      }
    );
  }

  return (
    <div className="auth-page">
      <h1>B2B-Promo</h1>
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="email">
            이메일 <span className="required">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="password">
            비밀번호 <span className="required">*</span>
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {loginMutation.error && (
          <p className="auth-error">
            {loginMutation.error.body?.error ?? loginMutation.error.message}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={loginMutation.isPending}>
          로그인
        </button>
      </form>
      <p className="auth-footer">아직 계정이 없으신가요?</p>
      <Link to="/signup" className="btn-secondary">
        회원가입하기
      </Link>
    </div>
  );
}
