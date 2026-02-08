CREATE UNIQUE INDEX IF NOT EXISTS idx_users_room_display_name_ci
  ON users (room_id, display_name COLLATE NOCASE);

