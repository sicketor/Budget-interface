-- מודל נתונים לשלב ה-Backend (סעיף 27 במפרט). PostgreSQL.
-- הגרסה הנוכחית שומרת את אותו מבנה כ-JSON בדפדפן (js/store.js); המעבר לשרת מחליף רק את שכבת האחסון.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                       -- argon2id / bcrypt, לעולם לא טקסט גלוי
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                          -- מחיקת חשבון לפי בקשה
);

CREATE TABLE households (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adults              SMALLINT NOT NULL DEFAULT 2,
  kids                SMALLINT NOT NULL DEFAULT 0,
  housing             TEXT NOT NULL DEFAULT 'rent' CHECK (housing IN ('rent','mortgage','own','family')),
  has_car             BOOLEAN NOT NULL DEFAULT false,
  cars                SMALLINT NOT NULL DEFAULT 0,
  has_loans           BOOLEAN NOT NULL DEFAULT false,
  has_property        BOOLEAN NOT NULL DEFAULT false,
  has_business        BOOLEAN NOT NULL DEFAULT false,
  has_portfolio       BOOLEAN NOT NULL DEFAULT false,
  liquid_savings      NUMERIC(12,2),                 -- מוצפן ברמת העמודה (pgcrypto / KMS)
  buffer_monthly      NUMERIC(12,2),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expense_categories (
  id         TEXT PRIMARY KEY,                       -- housing, finance, transport, kids, daily, leisure, health, other
  name_he    TEXT NOT NULL,
  sort_order SMALLINT NOT NULL
);

-- frequency: monthly | bimonthly | annual | once | varying
-- הכלל: monthly_equivalent = amount / (1 | 2 | 12 | 12) ; varying = SUM(monthly_values)/12
CREATE TABLE incomes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_key  TEXT,                                 -- salary1 / business ... או NULL למקור מותאם אישית
  name         TEXT NOT NULL,
  amount       NUMERIC(12,2),
  frequency    TEXT NOT NULL,
  month        SMALLINT CHECK (month BETWEEN 0 AND 11),
  monthly_values NUMERIC(12,2)[12],
  employment   TEXT CHECK (employment IN ('salaried','self')),
  year         SMALLINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES expense_categories(id),
  catalog_key  TEXT,                                 -- rent / fuel ... או NULL להוצאה מותאמת אישית
  name         TEXT NOT NULL,
  amount       NUMERIC(12,2),
  frequency    TEXT NOT NULL,
  month        SMALLINT CHECK (month BETWEEN 0 AND 11),
  monthly_values NUMERIC(12,2)[12],
  expense_type TEXT NOT NULL CHECK (expense_type IN ('fixed','variable','once')),
  year         SMALLINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'monthly_investment',
  target_amount  NUMERIC(12,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- תובנות נגזרות — נשמרות כ-snapshot לצורך היסטוריה ומגמות, לא כמקור אמת
CREATE TABLE insight_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics     JSONB NOT NULL,                        -- תוצאת Engine.compute
  insights    JSONB NOT NULL
);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,                          -- login, update_expense, export, delete_account ...
  entity     TEXT,
  entity_id  UUID,
  ip         INET,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- הפרדה בין משתמשים ברמת ה-DB (Row Level Security)
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals      ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON households USING (user_id = current_setting('app.user_id')::uuid);
CREATE POLICY own_rows ON incomes    USING (user_id = current_setting('app.user_id')::uuid);
CREATE POLICY own_rows ON expenses   USING (user_id = current_setting('app.user_id')::uuid);
CREATE POLICY own_rows ON goals      USING (user_id = current_setting('app.user_id')::uuid);
