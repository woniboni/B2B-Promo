import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useMe, useUpdateMe, useChangePassword } from '../api/users';
import './auth.css';
import './promotions.css';

export default function MyPage() {
  const role = useAuthStore((s) => s.user?.role);
  const backTo = role === 'admin' ? '/admin' : '/';

  const { data: me, isLoading, isError } = useMe();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileMessage, setProfileMessage] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const updateMeMutation = useUpdateMe();

  useEffect(() => {
    if (me) {
      setName(me.name || '');
      setPhone(me.phone || '');
    }
  }, [me]);

  function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    updateMeMutation.mutate(
      { name, phone },
      {
        onSuccess: () => setProfileMessage('정보가 저장되었습니다.'),
        onError: (err) => setProfileError(err.body?.error || err.message),
      }
    );
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const changePasswordMutation = useChangePassword();

  function handleChangePassword(e) {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    changePasswordMutation.mutate(
      { current_password: currentPassword, new_password: newPassword },
      {
        onSuccess: (data) => {
          setPasswordMessage(data.message);
          setCurrentPassword('');
          setNewPassword('');
        },
        onError: (err) => setPasswordError(err.body?.error || err.message),
      }
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to={backTo}>← 뒤로</Link>
        <h1>마이페이지</h1>
      </header>

      {isLoading && <p>불러오는 중...</p>}
      {isError && <p>내 정보를 불러오지 못했습니다.</p>}

      {me && (
        <>
          <form onSubmit={handleSaveProfile} style={{ marginBottom: 'var(--space-8)' }}>
            <div className="auth-field">
              <label>이메일</label>
              <p>{me.email}</p>
            </div>
            <div className="auth-field">
              <label htmlFor="name">이름</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="auth-field">
              <label htmlFor="phone">전화번호</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {profileError && <p className="auth-error">{profileError}</p>}
            {profileMessage && <p className="auth-success">{profileMessage}</p>}
            <button type="submit" className="btn-primary" disabled={updateMeMutation.isPending}>
              정보 저장
            </button>
          </form>

          <h2>비밀번호 변경</h2>
          <form onSubmit={handleChangePassword}>
            <div className="auth-field">
              <label htmlFor="current-password">현재 비밀번호</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="new-password">새 비밀번호</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {passwordError && <p className="auth-error">{passwordError}</p>}
            {passwordMessage && <p className="auth-success">{passwordMessage}</p>}
            <button type="submit" className="btn-primary" disabled={changePasswordMutation.isPending}>
              변경하기
            </button>
          </form>
        </>
      )}
    </div>
  );
}
