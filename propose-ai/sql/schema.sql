-- ============================================================
-- ProposeAI — полная схема БД (Supabase / PostgreSQL)
-- Запустить в Supabase Dashboard → SQL Editor
-- ============================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ПОЛЬЗОВАТЕЛИ ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  stripe_customer_id    TEXT,
  yookassa_customer_id  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ПРОФИЛИ КОМПАНИЙ ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_profiles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT,
  industry    TEXT,
  services    TEXT,
  usp         TEXT,
  cases       TEXT,
  logo_url    TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ ──────────────────────────────
CREATE TABLE IF NOT EXISTS proposals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  client_name     TEXT,
  client_industry TEXT,
  client_need     TEXT,
  model           TEXT DEFAULT 'claude-sonnet-4',
  tone            TEXT DEFAULT 'consultative',
  length          TEXT DEFAULT 'medium',
  content         TEXT,
  word_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS proposals_user_id_idx ON proposals(user_id);

-- ── СЧЁТЧИК ИСПОЛЬЗОВАНИЯ ─────────────────────────────────
CREATE TABLE IF NOT EXISTS usage (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  month   TEXT NOT NULL,           -- формат: '2026-03'
  count   INTEGER DEFAULT 0,
  UNIQUE(user_id, month)
);

-- ── ПЛАТЕЖИ ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES users(id),
  provider            TEXT NOT NULL,   -- 'stripe' | 'yookassa' | 'nowpayments'
  external_id         TEXT UNIQUE,     -- ID платежа у провайдера
  plan                TEXT,
  amount              INTEGER,         -- в копейках или центах * 100
  currency            TEXT DEFAULT 'rub',
  status              TEXT DEFAULT 'pending',  -- pending|paid|failed|cancelled
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;

-- Пользователи видят только свои данные
CREATE POLICY "users_self"    ON users            FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_self" ON company_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "proposals_self" ON proposals       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "usage_self"    ON usage            FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "payments_self" ON payments         FOR ALL USING (auth.uid() = user_id);

-- Автосоздание users-записи при регистрации через Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── ОБНОВЛЕНИЯ СХЕМЫ (Неделя 2) ──────────────────────────
-- Добавить onboarding_done в users
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT FALSE;

-- Добавить email_verified флаг
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Таблица email_log — не слать одно письмо дважды
CREATE TABLE IF NOT EXISTS email_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- 'welcome', 'trial_reminder_3', 'trial_expire', 'payment_success'
  sent_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- RLS для email_log (только сервер пишет)
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- ── ИНВАЙТЫ (бета-тест, Неделя 4) ────────────────────────
CREATE TABLE IF NOT EXISTS invites (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       TEXT UNIQUE NOT NULL,
  email      TEXT NOT NULL,
  plan       TEXT DEFAULT 'pro',
  note       TEXT,
  used       BOOLEAN DEFAULT FALSE,
  used_at    TIMESTAMPTZ,
  used_by    UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Только сервис-роль читает инвайты
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- ── РЕФЕРАЛЬНАЯ ПРОГРАММА ────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  code                 TEXT UNIQUE NOT NULL,
  total_referred       INTEGER DEFAULT 0,
  total_paid           INTEGER DEFAULT 0,
  bonus_months_earned  INTEGER DEFAULT 0,
  bonus_months_used    INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id)
);

CREATE TABLE IF NOT EXISTS referral_uses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id  UUID REFERENCES referrals(id),
  owner_id     UUID REFERENCES users(id),
  referred_id  UUID REFERENCES users(id),
  paid         BOOLEAN DEFAULT FALSE,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_id)
);

ALTER TABLE referrals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals_self" ON referrals FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "ref_uses_self"  ON referral_uses FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = referred_id);

-- Функция: продлить триал/подписку на N дней
CREATE OR REPLACE FUNCTION extend_trial(p_user_id UUID, p_days INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, NOW()), NOW()) + (p_days || ' days')::INTERVAL,
      plan = CASE WHEN plan = 'free' THEN 'trial' ELSE plan END,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── РЕФЕРАЛЫ (Неделя 4+) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  referee_id   UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  ref_code     TEXT NOT NULL,
  rewarded     BOOLEAN DEFAULT FALSE,
  rewarded_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_self" ON referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- ── ИНДЕКС ДЛЯ УСКОРЕНИЯ ПОИСКА КП ─────────────────────────
CREATE INDEX IF NOT EXISTS proposals_created_at_idx ON proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS proposals_user_created_idx ON proposals(user_id, created_at DESC);

-- ── A/B ТЕСТЫ И АНАЛИТИКА (v6) ───────────────────────────────

CREATE TABLE IF NOT EXISTS ab_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  experiment  TEXT NOT NULL,
  variant     TEXT NOT NULL,
  event       TEXT NOT NULL,  -- view | click | paid | closed
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ab_events_exp_idx ON ab_events(experiment, variant, event);

CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_event_idx ON analytics_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_user_idx  ON analytics_events(user_id, created_at DESC);

-- Отключить RLS для analytics (только сервер пишет)
ALTER TABLE ab_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- ── АНАЛИТИКА СОБЫТИЙ ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  session_id TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ae_event_idx      ON analytics_events(event);
CREATE INDEX IF NOT EXISTS ae_user_idx       ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS ae_created_at_idx ON analytics_events(created_at DESC);
-- Нет RLS — только сервис-роль пишет/читает
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
