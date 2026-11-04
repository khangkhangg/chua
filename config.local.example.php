<?php
// Copy to config.local.php and fill in. Never commit config.local.php.
return [
    'secret' => 'paste a long random string here (php -r "echo bin2hex(random_bytes(32));")',
    'db' => ['user' => 'chua', 'pass' => 'database password'],
    'redis' => ['enabled' => true],
    'realtime' => ['enabled' => true],
    'payments' => [
        'enabled'      => true,
        'provider'     => 'sepay',
        'bank_bin'     => '970436',
        'account_no'   => '0123456789',
        'account_name' => 'CHUA AN TAM NAM',
        'bank_label'   => 'Vietcombank',
        'sepay_api_key' => 'the API key you set for the SePay webhook',
    ],
    'admin' => ['password_hash' => 'output of password_hash()'],
];
