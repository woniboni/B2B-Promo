import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 클라이언트 전역 상태: 로그인 세션(Access/Refresh Token, 로그인 사용자 정보)만 담는다.
// 서버 데이터(프로모션/신청 목록 등)는 TanStack Query 캐시가 SSOT이므로 여기 넣지 않는다.
export const useAuthStore = create(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'auth-storage' }
  )
);
