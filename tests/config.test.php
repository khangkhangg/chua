<?php
// Used by tests/run.php (CHUA_CONFIG_LOCAL points here). The database name must end in _test.
return [
    'secret' => 'test-secret',
    'trust_cloudflare' => false,
    'db' => ['dsn' => 'mysql:host=127.0.0.1;dbname=chua_test;charset=utf8mb4', 'user' => 'chua', 'pass' => getenv('CHUA_TEST_DB_PASS') ?: 'devpass'],
    'redis' => ['enabled' => (bool) getenv('CHUA_TEST_REDIS'), 'prefix' => 'chua_test:'],
    'realtime' => ['enabled' => true, 'public_url' => 'ws://127.0.0.1:9599', 'port' => 9599],
    'payments' => [
        'enabled' => true, 'provider' => 'sepay', 'bank_bin' => '970436', 'account_no' => '0123456789',
        'account_name' => 'CHUA AN TAM NAM', 'bank_label' => 'Vietcombank', 'sepay_api_key' => 'sepay-test-key',
        'payos_checksum_key' => 'payos-test-key', 'test_mode' => true,
    ],
    'admin' => ['password_hash' => password_hash('admin-test', PASSWORD_DEFAULT)],
];
