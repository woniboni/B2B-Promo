-- ============================================================================
-- B2B-Promo 데이터베이스 스키마 (PostgreSQL 17)
--
-- 변경 이력
--   v1.0  2026-08-13  최초 작성 (docs/8-erd.md v1.0 기반)
--   v1.1  2026-08-13  docs 정합성 교차 검토 결과 반영: 원자 증가 쿼리 예시에 RETURNING 절
--                      추가(docs/8-erd.md v1.1과 표현 통일), PRD 참조 버전을 v1.5로 갱신
--
-- 출처: docs/8-erd.md(v1.1), docs/1-domain-definition.md(v1.5), docs/3-prd.md(v1.5)
-- ORM 없이 이 스키마를 pg로 직접 실행한다. 인덱스 설계/파티셔닝 등 MVP 범위 밖 최적화는
-- 다루지 않는다(docs/8-erd.md와 동일 원칙).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- users: 로그인 계정 (거래처 담당자 / 관리자)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,                                   -- bcrypt 해시
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('partner', 'admin')), -- 거래처담당자/관리자
    name          VARCHAR(100) NOT NULL,
    phone         VARCHAR(30),
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- partners: 거래처 (User와 1:1, BR-2 — 회원가입은 거래처 담당자만)
-- ----------------------------------------------------------------------------
CREATE TABLE partners (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,                    -- 거래처명
    user_id    INT NOT NULL UNIQUE REFERENCES users(id),  -- 1:1
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
-- ponytail: 같은 회사 담당자가 여러 명 가입하면 각각 별도 partner가 된다(알려진 제약,
-- docs/1-domain-definition.md "알려진 제약" 절). 회사 단위 통합은 MVP 범위 밖.

-- ----------------------------------------------------------------------------
-- promotions: 프로모션 (관리자가 등록/게시/종료 관리)
-- ----------------------------------------------------------------------------
CREATE TABLE promotions (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    type        VARCHAR(30) NOT NULL
                CHECK (type IN ('price_discount', 'sample', 'tasting', 'bogo')), -- 가격할인/샘플증정/신제품시식/1+1
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'closed')),             -- 임시저장/게시됨/종료됨 (BR-9)
    created_by  INT NOT NULL REFERENCES users(id),                              -- 등록한 관리자
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
-- ponytail: 시작일/종료일 컬럼 없음(알려진 제약). 게시/종료는 status를 통한 관리자의
-- 수동 전환뿐이며 자동 스케줄링은 MVP 범위 밖.

-- ----------------------------------------------------------------------------
-- coupon_events: 프로모션에 선택적으로 부착되는 랜덤 쿠폰 뽑기 (1:0..1)
-- ----------------------------------------------------------------------------
CREATE TABLE coupon_events (
    id            SERIAL PRIMARY KEY,
    promotion_id  INT NOT NULL UNIQUE REFERENCES promotions(id),  -- 1:0..1
    capacity      INT NOT NULL DEFAULT 50 CHECK (capacity = 50),  -- 고정값 50 (MVP)
    applied_count INT NOT NULL DEFAULT 0
                  CHECK (applied_count >= 0 AND applied_count <= capacity),
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);
-- BR-6/BR-7: applied_count는 신청 성공 시에만 증가하고 취소해도 감소하지 않는다(슬롯 미반환).
-- 애플리케이션은 다음과 같은 조건부 원자 증가로 갱신해야 한다(docs/8-erd.md 참조):
--   UPDATE coupon_events SET applied_count = applied_count + 1
--   WHERE id = $1 AND applied_count < capacity
--   RETURNING applied_count;
--   (영향받은 행이 0건이면 마감으로 간주하고 신청을 거부한다)

-- ----------------------------------------------------------------------------
-- applications: 참여신청 (Promotion x Partner, BR-3)
-- ----------------------------------------------------------------------------
CREATE TABLE applications (
    id           SERIAL PRIMARY KEY,
    promotion_id INT NOT NULL REFERENCES promotions(id),
    partner_id   INT NOT NULL REFERENCES partners(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'applied'
                 CHECK (status IN ('applied', 'canceled')),  -- 신청됨/취소됨
    applied_at   TIMESTAMP NOT NULL DEFAULT now(),
    canceled_at  TIMESTAMP,
    UNIQUE (promotion_id, partner_id)  -- BR-3: (프로모션, 거래처) 조합당 1건.
                                        -- 취소/재신청은 새 행이 아니라 이 행의 상태 전환으로 처리한다.
);

-- ----------------------------------------------------------------------------
-- draw_results: 쿠폰 이벤트 추첨 결과 (Application과 1:0..1, BR-4/BR-5)
-- ----------------------------------------------------------------------------
CREATE TABLE draw_results (
    id             SERIAL PRIMARY KEY,
    application_id INT NOT NULL UNIQUE REFERENCES applications(id),  -- 1:0..1, upsert 대상
    discount_rate  NUMERIC(5,2) NOT NULL CHECK (discount_rate IN (5, 10, 15, 20)),
    confirmed_at   TIMESTAMP NOT NULL DEFAULT now(),
    expires_at     TIMESTAMP GENERATED ALWAYS AS (confirmed_at + INTERVAL '1 month') STORED  -- BR-8
);
-- BR-5: 재추첨 금지. 재신청 시 새 추첨 결과는 다음과 같이 같은 행에 덮어쓴다(삭제/재삽입 아님):
--   INSERT INTO draw_results (application_id, discount_rate, confirmed_at)
--   VALUES ($1, $2, now())
--   ON CONFLICT (application_id) DO UPDATE
--     SET discount_rate = EXCLUDED.discount_rate, confirmed_at = EXCLUDED.confirmed_at;
-- ponytail: expires_at을 GENERATED 컬럼으로 두어 "확정일+1개월" 계산을 앱 코드에서
-- 중복 구현하지 않는다. 별도 무효화 상태(status) 컬럼은 두지 않는다(1건만 유지).

COMMIT;

-- ============================================================================
-- ponytail: ENUM 타입/코드 테이블 없이 VARCHAR + CHECK로 상태값을 제약한다. 값 종류가
-- 늘어나면 ENUM 타입이나 코드 테이블로 승격을 검토한다. updated_at 자동 갱신 트리거도
-- 두지 않으며, 각 UPDATE 쿼리에서 애플리케이션 코드가 직접 값을 갱신한다.
-- ============================================================================
