import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePromotionDetail, PROMOTION_TYPE_LABELS } from '../../api/promotions';
import { useCreatePromotion, useUpdatePromotion } from '../../api/adminPromotions';
import '../auth.css';
import '../promotions.css';

const TYPE_OPTIONS = Object.entries(PROMOTION_TYPE_LABELS);

export default function AdminPromotionFormPage() {
  const { id } = useParams();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { data: existing } = usePromotionDetail(id);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('price_discount');
  const [description, setDescription] = useState('');
  const [couponEvent, setCouponEvent] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (isEditMode && existing) {
      setTitle(existing.title);
      setType(existing.type);
      setDescription(existing.description || '');
      setCouponEvent(!!existing.coupon_event);
    }
  }, [isEditMode, existing]);

  const createMutation = useCreatePromotion();
  const updateMutation = useUpdatePromotion();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function handleSave(status) {
    setFormError(null);
    if (isEditMode) {
      updateMutation.mutate(
        { id, payload: { title, type, description } },
        { onSuccess: () => navigate('/admin'), onError: (err) => setFormError(err.body?.error || err.message) }
      );
    } else {
      createMutation.mutate(
        { title, type, description, status, coupon_event: couponEvent },
        { onSuccess: () => navigate('/admin'), onError: (err) => setFormError(err.body?.error || err.message) }
      );
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/admin">← 목록으로</Link>
        <h1>프로모션 {isEditMode ? '수정' : '등록'}</h1>
      </header>
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="auth-field">
          <label htmlFor="title">
            제목 <span className="required">*</span>
          </label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="auth-field">
          <label>
            유형 <span className="required">*</span>
          </label>
          {TYPE_OPTIONS.map(([value, label]) => (
            <label key={value} style={{ marginRight: 'var(--space-4)', fontWeight: 'var(--font-weight-regular)' }}>
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
              />{' '}
              {label}
            </label>
          ))}
        </div>
        <div className="auth-field">
          <label htmlFor="description">설명</label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {!isEditMode && (
          <div className="auth-field">
            <label style={{ fontWeight: 'var(--font-weight-regular)' }}>
              <input type="checkbox" checked={couponEvent} onChange={(e) => setCouponEvent(e.target.checked)} />{' '}
              쿠폰 이벤트 부착 (정원 50명 고정, 등록 후 변경 불가)
            </label>
          </div>
        )}
        {isEditMode && existing?.coupon_event && (
          <p className="promotion-notice">
            쿠폰 이벤트 부착됨 (정원 {existing.coupon_event.capacity}명, 등록 후 변경 불가)
          </p>
        )}

        {formError && <p className="auth-error">{formError}</p>}

        {!isEditMode && (
          <>
            <button type="button" className="btn-secondary" disabled={isSaving} onClick={() => handleSave('draft')}>
              임시저장
            </button>
            <button type="button" className="btn-primary" disabled={isSaving} onClick={() => handleSave('published')}>
              게시하기
            </button>
          </>
        )}
        {isEditMode && (
          <button type="button" className="btn-primary" disabled={isSaving} onClick={() => handleSave()}>
            저장
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => navigate('/admin')}>
          취소
        </button>
      </form>
    </div>
  );
}
