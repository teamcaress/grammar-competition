-- Postgres schema for Supabase (replaces Cloudflare D1).

CREATE TABLE IF NOT EXISTS rooms (
  id text PRIMARY KEY,
  room_code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cards (
  id text PRIMARY KEY,
  unit_id text NOT NULL,
  subtopic text NOT NULL,
  prompt text NOT NULL,
  choices_json jsonb NOT NULL,
  correct_choice text NOT NULL CHECK (correct_choice IN ('A', 'B', 'C', 'D')),
  explanation text NOT NULL,
  difficulty integer NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  tags_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_card_state (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  box integer NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 4),
  due_date timestamptz NOT NULL,
  correct_streak integer NOT NULL DEFAULT 0,
  total_attempts integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  PRIMARY KEY (user_id, card_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT now(),
  correct boolean NOT NULL,
  choice text NOT NULL CHECK (choice IN ('A', 'B', 'C', 'D')),
  response_ms integer NOT NULL CHECK (response_ms >= 0)
);

CREATE TABLE IF NOT EXISTS daily_scores (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  points integer NOT NULL DEFAULT 0,
  answers_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_card_state_due
  ON user_card_state (user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_reviews_user_timestamp
  ON reviews (user_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_daily_scores_date_points
  ON daily_scores (date, points DESC);

