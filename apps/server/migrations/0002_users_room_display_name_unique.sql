-- Enforce display_name uniqueness per room, case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_room_display_name_ci
  ON users (room_id, lower(display_name));

