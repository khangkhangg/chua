-- An Tâm Nam Chùa schema (MySQL 8 / MariaDB 10.6+). Safe to run again.
CREATE TABLE IF NOT EXISTS guests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token CHAR(64) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  last_seen DATETIME NOT NULL,
  KEY idx_guest_ip (ip_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('name','ip') NOT NULL,
  value VARCHAR(80) NOT NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_ban (kind, value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter VARCHAR(40) NOT NULL,
  reported VARCHAR(40) NOT NULL,
  reported_ip_hash CHAR(64) NULL,
  reason VARCHAR(200) NOT NULL DEFAULT '',
  context TEXT NULL,
  status ENUM('open','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL,
  KEY idx_report_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shard VARCHAR(24) NOT NULL,
  name VARCHAR(40) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  text VARCHAR(200) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_chat_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wishes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guest_id BIGINT UNSIGNED NULL,
  name VARCHAR(40) NOT NULL,
  text VARCHAR(200) NOT NULL,
  status ENUM('visible','pending','hidden') NOT NULL DEFAULT 'visible',
  ip_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_wish_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candle_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(9) NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  wish VARCHAR(200) NOT NULL DEFAULT '',
  size ENUM('small','medium','large') NOT NULL,
  amount INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','expired') NOT NULL DEFAULT 'pending',
  ip_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  KEY idx_order_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,
  txn_id VARCHAR(100) NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  amount BIGINT NOT NULL,
  content VARCHAR(255) NOT NULL DEFAULT '',
  raw MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_txn (provider, txn_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  name VARCHAR(40) NOT NULL,
  wish VARCHAR(200) NOT NULL DEFAULT '',
  size ENUM('small','medium','large') NOT NULL,
  lit_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_candle_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events_daily (
  day DATE NOT NULL,
  type VARCHAR(30) NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  k VARCHAR(120) NOT NULL PRIMARY KEY,
  n INT UNSIGNED NOT NULL,
  reset_at INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
