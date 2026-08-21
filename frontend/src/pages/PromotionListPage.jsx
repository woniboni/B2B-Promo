import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePromotions, PROMOTION_TYPE_LABELS } from '../api/promotions';
import './promotions.css';

export default function PromotionListPage() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { data: promotions, isLoading, isError } = usePromotions();

  return (
    <div className="page">
      <header className="page-header">
        <h1>B2B-Promo</h1>
        <div className="page-nav">
          <nav className="page-nav-links">
            <Link to="/applications/me">내 신청 목록</Link>
            <Link to="/mypage">마이페이지</Link>
          </nav>
          <button
            className="btn-logout"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            로그아웃
          </button>
        </div>
      </header>
      <h2>진행 중인 프로모션</h2>
      {isLoading && <p>불러오는 중...</p>}
      {isError && <p>목록을 불러오지 못했습니다.</p>}
      <div className="promotion-grid">
        {promotions?.map((promo) => (
          <div
            key={promo.id}
            className="promotion-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/promotions/${promo.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/promotions/${promo.id}`);
            }}
          >
            <span className="badge badge-type">{PROMOTION_TYPE_LABELS[promo.type]}</span>
            {promo.coupon_event && <span className="badge badge-coupon">쿠폰이벤트</span>}
            <h3>{promo.title}</h3>
            {promo.coupon_event && (
              <p className="promotion-remaining">
                잔여 {promo.coupon_event.capacity - promo.coupon_event.applied_count}/{promo.coupon_event.capacity}명
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
