import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePromotionDetail, PROMOTION_TYPE_LABELS } from '../api/promotions';
import { useApplyPromotion } from '../api/applications';
import './promotions.css';

export default function PromotionDetailPage() {
  const { id } = useParams();
  const { data: promotion, isLoading, isError } = usePromotionDetail(id);
  const applyMutation = useApplyPromotion();

  const [applied, setApplied] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [drawResult, setDrawResult] = useState(null);

  if (isLoading) return <p>불러오는 중...</p>;
  if (isError || !promotion) return <p>프로모션을 찾을 수 없습니다.</p>;

  const couponEvent = promotion.coupon_event;
  const remaining = couponEvent ? couponEvent.capacity - couponEvent.applied_count : null;
  const isFull = couponEvent ? remaining <= 0 : false;
  const percent = couponEvent ? Math.round((couponEvent.applied_count / couponEvent.capacity) * 100) : 0;
  const isClosed = promotion.status === 'closed';

  function handleApply() {
    setApplyError(null);
    applyMutation.mutate(id, {
      onSuccess: (data) => {
        if (data.draw_result) {
          setDrawResult(data.draw_result);
        } else {
          setApplied(true);
        }
      },
      onError: (err) => {
        if (err.status === 409 && err.body?.error === '이미 신청한 프로모션입니다.') {
          setDuplicate(true);
        } else {
          setApplyError(err.body?.error || err.message);
        }
      },
    });
  }

  function renderActionArea() {
    if (isClosed) {
      return <p className="promotion-notice">이 프로모션은 종료되어 신규 참여 신청이 불가합니다.</p>;
    }
    if (applied) {
      return <p className="promotion-notice">신청이 완료되었습니다.</p>;
    }
    if (duplicate) {
      return <p className="promotion-notice">이미 신청한 프로모션입니다.</p>;
    }
    return (
      <>
        <button
          type="button"
          className="btn-primary"
          disabled={isFull || applyMutation.isPending}
          onClick={handleApply}
        >
          {isFull ? '마감되었습니다' : '참여 신청하기'}
        </button>
        {applyError && <p className="auth-error">{applyError}</p>}
      </>
    );
  }

  return (
    <div className="page">
      <Link to="/" className="detail-back-link">
        ← 뒤로
      </Link>
      <div>
        <span className="badge badge-type">{PROMOTION_TYPE_LABELS[promotion.type]}</span>
        {couponEvent && <span className="badge badge-coupon">쿠폰이벤트</span>}
      </div>
      <h1>{promotion.title}</h1>
      <p className="promotion-description">{promotion.description}</p>
      {couponEvent && (
        <div className="coupon-section">
          <p>쿠폰 이벤트 (선착순 {couponEvent.capacity}명)</p>
          <p>
            {isFull
              ? `마감되었습니다 (0 / ${couponEvent.capacity}명 남음)`
              : `잔여 ${remaining} / ${couponEvent.capacity}명 남음`}
          </p>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      {renderActionArea()}

      {drawResult && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h2>축하합니다! 🎉</h2>
            {/* discount_rate는 백엔드 NUMERIC(5,2) 컬럼이라 "10.00" 형태의 문자열로 오므로 정수로 정리해 표시한다. */}
            <p>당첨 할인율: {Math.round(Number(drawResult.discount_rate))}%</p>
            <p>
              유효기한: {new Date(drawResult.expires_at).toLocaleDateString('ko-KR')}
              <br />
              (확정일로부터 1개월)
            </p>
            <p className="modal-notice">※ 재추첨은 제공되지 않습니다.</p>
            <button type="button" className="btn-primary" onClick={() => setDrawResult(null)}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
