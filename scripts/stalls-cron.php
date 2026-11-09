<?php
declare(strict_types=1);
// Hourly from /etc/cron.d/chua-stalls: expire unpaid stall requests and holds, send end-of-rental reminders.
require dirname(__DIR__) . '/src/bootstrap.php';

$r = Chua\Stalls::cron();
if (array_sum($r) > 0) {
    echo gmdate('c'), ' ', json_encode($r), "\n";
}
