<?php
declare(strict_types=1);

// Defaults only. Put real values (database password, bank account, webhook keys,
// admin password hash, secret) in config.local.php next to this file. That file is
// not committed. See config.local.example.php.
$config = [
    'temple_name'   => 'An Tâm Nam Chùa',
    'asset_version' => '0.8.4',
    'base_url'      => 'https://chua.vietnamcos.com',
    // Long random string used to hash visitor IP addresses. Set it in config.local.php.
    'secret'        => 'change-me',
    // True when the site is behind Cloudflare: the visitor IP comes from CF-Connecting-IP.
    'trust_cloudflare' => true,

    'db' => [
        'dsn'  => 'mysql:host=127.0.0.1;dbname=chua;charset=utf8mb4',
        'user' => 'chua',
        'pass' => '',
    ],

    // Optional. Needed for more than one realtime node, a global visitor count and
    // instant candle notices. Without it everything still works on one node.
    'redis' => [
        'enabled' => false,
        'host'    => '127.0.0.1',
        'port'    => 6379,
        'prefix'  => 'chua:',
    ],

    'realtime' => [
        'enabled'     => false,
        // 'ws': a realtime server (VPS). 'poll': no server, each page checks in about once
        // a second through api/live.php and MySQL (shared hosting such as Hostinger).
        'mode'        => 'ws',
        'poll_ms'     => 1000,
        'node_id'     => 'node1',
        'public_url'  => 'wss://chua.vietnamcos.com/ws',  // what browsers connect to
        'host'        => '127.0.0.1',                       // what the server listens on
        'port'        => 9502,
        'shard_size'  => 150,     // visitors per courtyard copy
        'room_size'   => 30,      // visitors per room inside a hall
        'view_count'  => 60,      // nearest visitors each person receives
        'view_radius' => 40.0,    // metres
        'tick_ms'     => 100,     // 10 updates per second
        'max_per_ip'  => 6,
    ],

    'payments' => [
        'enabled'      => false,
        'provider'     => 'sepay',        // sepay or payos (which webhook to trust)
        'bank_bin'     => '',             // Napas BIN, e.g. 970436 for Vietcombank
        'account_no'   => '',
        'account_name' => '',             // as printed by the bank, without accents
        'bank_label'   => '',             // shown to visitors, e.g. "Vietcombank"
        'sepay_api_key'      => '',
        'payos_checksum_key' => '',
        'test_mode'    => false,          // shows a "simulate payment" button; never in production
        'sizes'        => ['small' => 10000, 'medium' => 20000, 'large' => 50000],
        'candle_hours' => 24,
        'order_minutes' => 30,            // unpaid orders expire after this
    ],

    'admin' => [
        // php -r 'echo password_hash("your password", PASSWORD_DEFAULT), PHP_EOL;'
        'password_hash' => '',
    ],
];

$local = getenv('CHUA_CONFIG_LOCAL') ?: __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}
return $config;
