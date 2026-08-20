import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAdminPromotions, useUpdatePromotionStatus } from '../../api/adminPromotions';
import { PROMOTION_TYPE_LABELS } from '../../api/promotions';
import '../promotions.css';
import './admin.css';

const STATUS_LABELS = { draft: '임시저장', published: '게시됨', closed: '종료됨' };
const STATUS_BADGE_CLASS = { draft: 'badge-status-draft', published: 'badge-status-published', closed: 'badge-status-closed' };

export default function AdminPromotionListPage() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { data: promotions, isLoading, isError } = useAdminPromotions();
  const updateStatusMutation = useUpdatePromotionStatus();

  function renderActions(promotion) {
    if (promotion.status === 'draft') {
      return (
        <>
          <Link to={`/admin/promotions/${promotion.id}/edit`} className="btn-link">
            수정
          </Link>
          <button
            type="button"
            className="btn-link"
            disabled={updateStatusMutation.isPending}
            onClick={() => updateStatusMutation.mutate({ id: promotion.id, status: 'published' })}
          >
            게시
          </button>
        </>
      );
    }
    if (promotion.status === 'published') {
      return (
        <>
          <Link to={`/admin/promotions/${promotion.id}/edit`} className="btn-link">
            수정
          </Link>
          <button
            type="button"
            className="btn-link"
            disabled={updateStatusMutation.isPending}
            onClick={() => updateStatusMutation.mutate({ id: promotion.id, status: 'closed' })}
          >
            종료
          </button>
        </>
      );
    }
    // closed: 현황 조회는 FE-7에서 이어받는다 (onClick 미구현)
    return (
      <button type="button" className="btn-link">
        현황
      </button>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>관리자 프로모션 관리</h1>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          로그아웃
        </button>
      </header>

      <Link to="/admin/promotions/new" className="btn-primary admin-new-link">
        + 새 프로모션 등록
      </Link>

      {isLoading && <p>불러오는 중...</p>}
      {isError && <p>목록을 불러오지 못했습니다.</p>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>제목</th>
            <th>유형</th>
            <th>상태</th>
            <th>쿠폰이벤트</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {promotions?.map((promotion) => (
            <tr key={promotion.id}>
              <td>{promotion.title}</td>
              <td>{PROMOTION_TYPE_LABELS[promotion.type]}</td>
              <td>
                <span className={`badge ${STATUS_BADGE_CLASS[promotion.status]}`}>
                  {STATUS_LABELS[promotion.status]}
                </span>
              </td>
              <td>
                {promotion.coupon_event
                  ? `${promotion.coupon_event.applied_count}/${promotion.coupon_event.capacity}`
                  : '-'}
              </td>
              <td className="admin-actions">{renderActions(promotion)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="admin-card-list">
        {promotions?.map((promotion) => (
          <div key={promotion.id} className="admin-card">
            <p>
              <strong>제목:</strong> {promotion.title}
            </p>
            <p>
              <strong>유형:</strong> {PROMOTION_TYPE_LABELS[promotion.type]}
            </p>
            <p>
              <strong>상태:</strong>{' '}
              <span className={`badge ${STATUS_BADGE_CLASS[promotion.status]}`}>
                {STATUS_LABELS[promotion.status]}
              </span>
            </p>
            <p>
              <strong>쿠폰이벤트:</strong>{' '}
              {promotion.coupon_event
                ? `${promotion.coupon_event.applied_count}/${promotion.coupon_event.capacity}`
                : '-'}
            </p>
            <div className="admin-actions">{renderActions(promotion)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
