import { Link, useParams } from 'react-router-dom';
import { usePromotionDetail, PROMOTION_TYPE_LABELS } from '../../api/promotions';
import { useApplicationsSummary } from '../../api/adminPromotions';
import '../promotions.css';
import './admin.css';

const STATUS_LABELS = { draft: '임시저장', published: '게시됨', closed: '종료됨' };
const APPLICATION_STATUS_LABELS = { applied: '신청됨', canceled: '취소됨' };
const DISCOUNT_RATES = [5, 10, 15, 20];

function statusBadgeClass(status) {
  return status === 'applied' ? 'status-badge-applied' : 'status-badge-canceled';
}

export default function AdminPromotionStatusPage() {
  const { id } = useParams();
  const { data: promotion } = usePromotionDetail(id);
  const { data: summary, isLoading, isError } = useApplicationsSummary(id);

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/admin">← 목록으로</Link>
        <h1>
          참여 현황
          {promotion &&
            `: ${promotion.title} (${PROMOTION_TYPE_LABELS[promotion.type]} / ${STATUS_LABELS[promotion.status]})`}
        </h1>
      </header>

      {isLoading && <p>불러오는 중...</p>}
      {isError && <p>참여 현황을 불러오지 못했습니다.</p>}

      {summary && (
        <>
          <section>
            <h2>신청 거래처 수</h2>
            <p>
              신청됨: {summary.applied_status_count}건 취소됨: {summary.canceled_count}건 (합계{' '}
              {summary.applied_status_count + summary.canceled_count}건)
            </p>
          </section>

          {summary.coupon_event && (
            <section>
              <h2>쿠폰 이벤트 정원 현황</h2>
              <p>
                누적 신청(applied_count): {summary.coupon_event.applied_count} / {summary.coupon_event.capacity}
              </p>
            </section>
          )}

          {summary.coupon_event && (
            <section>
              <h2>할인율별 당첨 분포</h2>
              <p>
                {DISCOUNT_RATES.map((rate) => `${rate}%: ${summary.discount_distribution[rate] || 0}건`).join('   ')}
              </p>
            </section>
          )}

          <section>
            <h2>신청 거래처 목록</h2>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>거래처명</th>
                  <th>신청일</th>
                  <th>상태</th>
                  <th>당첨 할인율</th>
                </tr>
              </thead>
              <tbody>
                {summary.applications.map((application, index) => (
                  <tr key={index}>
                    <td>{application.partner_name}</td>
                    <td>{new Date(application.applied_at).toLocaleDateString('ko-KR')}</td>
                    <td>
                      <span className={`badge ${statusBadgeClass(application.status)}`}>
                        {APPLICATION_STATUS_LABELS[application.status]}
                      </span>
                    </td>
                    <td>
                      {application.discount_rate != null ? `${Math.round(Number(application.discount_rate))}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="admin-card-list">
              {summary.applications.map((application, index) => (
                <div key={index} className="admin-card">
                  <p>
                    <strong>거래처명:</strong> {application.partner_name}
                  </p>
                  <p>
                    <strong>신청일:</strong> {new Date(application.applied_at).toLocaleDateString('ko-KR')}
                  </p>
                  <p>
                    <strong>상태:</strong>{' '}
                    <span className={`badge ${statusBadgeClass(application.status)}`}>
                      {APPLICATION_STATUS_LABELS[application.status]}
                    </span>
                  </p>
                  <p>
                    <strong>당첨 할인율:</strong>{' '}
                    {application.discount_rate != null ? `${Math.round(Number(application.discount_rate))}%` : '-'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
