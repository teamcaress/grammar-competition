CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  room_code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  room_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms (id)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  prompt TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  correct_choice TEXT NOT NULL CHECK (correct_choice IN ('A', 'B', 'C', 'D')),
  explanation TEXT NOT NULL,
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_card_state (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 4),
  due_date TEXT NOT NULL,
  correct_streak INTEGER NOT NULL DEFAULT 0,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  PRIMARY KEY (user_id, card_id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (card_id) REFERENCES cards (id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  choice TEXT NOT NULL CHECK (choice IN ('A', 'B', 'C', 'D')),
  response_ms INTEGER NOT NULL CHECK (response_ms >= 0),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (card_id) REFERENCES cards (id)
);

CREATE TABLE IF NOT EXISTS daily_scores (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  answers_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_user_card_state_due
  ON user_card_state (user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_reviews_user_timestamp
  ON reviews (user_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_daily_scores_date_points
  ON daily_scores (date, points DESC);

