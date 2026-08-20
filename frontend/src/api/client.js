import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function rawRequest(path, options, accessToken) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${BASE_URL}${path}`, { ...options, headers });
}

// 5-project-principle.md 2.1절: Access Token 부착 + 401 시 /auth/refresh 재시도를
// 이 fetch 래퍼 한 곳에만 둔다. 각 화면/훅에서 개별 재구현하지 않는다.
export async function apiFetch(path, options = {}) {
  const { accessToken, refreshToken, setTokens, logout } = useAuthStore.getState();

  let res = await rawRequest(path, options, accessToken);

  // accessToken이 애초에 없었던 요청(예: /auth/login 자체의 401=자격증명 불일치)은
  // "세션 만료"가 아니므로 refresh를 시도하지 않는다 — 아래 공통 에러 처리로 흘려보내
  // 백엔드가 내려준 실제 에러 메시지(예: "이메일 또는 비밀번호가 올바르지 않습니다.")를 보존한다.
  if (res.status === 401 && accessToken) {
    if (!refreshToken) {
      logout();
      window.location.href = '/login';
      throw new Error('인증이 필요합니다.');
    }

    const refreshRes = await rawRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (refreshRes.ok) {
      // swagger.json: /auth/refresh는 access_token만 반환하고 refresh token은 회전하지 않는다.
      const { access_token: newAccessToken } = await refreshRes.json();
      setTokens(newAccessToken, refreshToken);
      res = await rawRequest(path, options, newAccessToken);
    } else {
      logout();
      window.location.href = '/login';
      throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error || '요청에 실패했습니다.'), { status: res.status, body });
  }

  return res.status === 204 ? null : res.json();
}
