-- Market stalls for rent (see docs/STALLS.md). Safe to run again.
CREATE TABLE IF NOT EXISTS vendors (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  last_login DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time sign-in links; only the hash of the token is stored.
CREATE TABLE IF NOT EXISTS vendor_logins (
  token_hash CHAR(64) PRIMARY KEY,
  vendor_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  KEY idx_login_vendor (vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per stall in the market, slot 0..11 in the order temple.js lays them out.
CREATE TABLE IF NOT EXISTS stalls (
  slot TINYINT UNSIGNED PRIMARY KEY,
  vendor_id INT UNSIGNED NULL,
  paid_until DATETIME NULL,
  held_by INT UNSIGNED NULL,
  held_until DATETIME NULL,
  shop_name VARCHAR(60) NULL,
  logo VARCHAR(80) NULL,
  url VARCHAR(200) NULL,
  menu TEXT NULL,
  taken_down_at DATETIME NULL,
  takedown_reason VARCHAR(200) NULL,
  reminded_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO stalls (slot) VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11);

CREATE TABLE IF NOT EXISTS stall_rentals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code CHAR(9) NOT NULL UNIQUE,
  vendor_id INT UNSIGNED NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  months TINYINT UNSIGNED NOT NULL,
  amount INT UNSIGNED NOT NULL,
  status ENUM('pending','claimed','approved','expired') NOT NULL DEFAULT 'pending',
  decide_token CHAR(64) NULL UNIQUE,
  created_at DATETIME NOT NULL,
  claimed_at DATETIME NULL,
  decided_at DATETIME NULL,
  KEY idx_rental_vendor (vendor_id),
  KEY idx_rental_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
