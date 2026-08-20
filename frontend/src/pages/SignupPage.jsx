import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSignup } from '../api/auth';
import './auth.css';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const navigate = useNavigate();
  const signupMutation = useSignup();

  function handleSubmit(e) {
    e.preventDefault();
    signupMutation.mutate(
      { email, password, name, phone, partner_name: partnerName },
      { onSuccess: () => navigate('/login') }
    );
  }

  return (
    <div className="auth-page">
      <h1>회원가입</h1>
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="name">
            이름 <span className="required">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="phone">
            전화번호 <span className="required">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="partnerName">
            거래처명(회사명) <span className="required">*</span>
          </label>
          <input
            id="partnerName"
            type="text"
            required
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
          />
        </div>
        {signupMutation.error && (
          <p className="auth-error">
            {signupMutation.error.body?.error ?? signupMutation.error.message}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={signupMutation.isPending}>
          가입하기
        </button>
      </form>
      <p className="auth-footer">이미 계정이 있으신가요?</p>
      <Link to="/login" className="btn-secondary">
        로그인하러 가기
      </Link>
    </div>
  );
}
