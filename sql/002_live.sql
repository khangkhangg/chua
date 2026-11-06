-- Live visitors without a realtime server (realtime.mode = 'poll', for shared hosting). Safe to run again.
-- MEMORY tables: positions change every second and need not survive a database restart, and
-- skipping the disk makes each check-in several times cheaper. If your host refuses MEMORY,
-- replace ENGINE=MEMORY with ENGINE=InnoDB (slower, still works).
CREATE TABLE IF NOT EXISTS live_presence (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sid CHAR(32) NOT NULL UNIQUE,
  shard VARCHAR(12) NOT NULL,
  room VARCHAR(12) NOT NULL DEFAULT '',
  name VARCHAR(40) NOT NULL,
  look VARCHAR(120) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  x FLOAT NOT NULL DEFAULT 0,
  z FLOAT NOT NULL DEFAULT 30,
  h TINYINT UNSIGNED NOT NULL DEFAULT 128,
  pose TINYINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DOUBLE NOT NULL,
  KEY idx_live_shard (shard, updated_at),
  KEY idx_live_ip (ip_hash, updated_at)
) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS live_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shard VARCHAR(12) NOT NULL DEFAULT '',
  room VARCHAR(12) NULL,
  type VARCHAR(12) NOT NULL,
  actor INT UNSIGNED NULL,
  x FLOAT NULL,
  z FLOAT NULL,
  radius FLOAT NULL,
  data VARCHAR(400) NOT NULL DEFAULT '{}',
  created_at DOUBLE NOT NULL,
  KEY idx_live_ev_time (created_at)
) ENGINE=MEMORY DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
