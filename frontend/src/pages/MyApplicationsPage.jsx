import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMyApplications, useCancelApplication, useApplyPromotion } from '../api/applications';
import { PROMOTION_TYPE_LABELS } from '../api/promotions';
import './promotions.css';

export default function MyApplicationsPage() {
  const { data: applications, isLoading, isError } = useMyApplications();
  const cancelMutation = useCancelApplication();
  const applyMutation = useApplyPromotion();
  const [reapplyErrors, setReapplyErrors] = useState({});

  function handleCancel(applicationId) {
    cancelMutation.mutate(applicationId);
  }

  function handleReapply(application) {
    setReapplyErrors((prev) => ({ ...prev, [application.id]: null }));
    applyMutation.mutate(application.promotion_id, {
      onError: (err) => {
        setReapplyErrors((prev) => ({
          ...prev,
          [application.id]: err.body?.error || err.message,
        }));
      },
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/">← 뒤로</Link>
        <h1>내 신청 목록</h1>
      </header>

      {isLoading && <p>불러오는 중...</p>}
      {isError && <p>목록을 불러오지 못했습니다.</p>}

      <div className="application-list">
        {applications?.map((application) => {
          const { promotion, draw_result: drawResult } = application;
          const isClosed = promotion.status === 'closed';
          return (
            <div key={application.id} className="application-card">
              <div>
                <span className="badge badge-type">{PROMOTION_TYPE_LABELS[promotion.type]}</span>
                {isClosed && <span className="badge closed-tag">[종료된 프로모션]</span>}
              </div>
              <h3>{promotion.title}</h3>
              <p>
                상태:{' '}
                <span
                  className={`badge ${
                    application.status === 'applied' ? 'status-badge-applied' : 'status-badge-canceled'
                  }`}
                >
                  {application.status === 'applied' ? '신청됨' : '취소됨'}
                </span>
              </p>
              {drawResult && (
                <p>
                  당첨 {Math.round(Number(drawResult.discount_rate))}% (~
                  {new Date(drawResult.expires_at).toLocaleDateString('ko-KR')})
                </p>
              )}

              {application.status === 'applied' && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleCancel(application.id)}
                  disabled={cancelMutation.isPending}
                >
                  취소하기
                </button>
              )}
              {application.status === 'canceled' && !isClosed && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleReapply(application)}
                    disabled={applyMutation.isPending}
                  >
                    재신청하기
                  </button>
                  {reapplyErrors[application.id] && (
                    <p className="auth-error">{reapplyErrors[application.id]}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
