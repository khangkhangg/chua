<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Db;
use Chua\Http;

// POST {counts: {incense: 2, bell: 1, ...}} -> daily totals for the admin page.
Http::requireMethod('POST');
$allowed = ['visit', 'incense', 'bell', 'prostrate', 'meditate', 'pray_hall', 'monk_chat', 'sweep', 'dog', 'fortune', 'wish', 'candle_view', 'hall_visit'];
$in = Http::input();
if (!Http::allow('event:' . Http::ipHash(), 10, 60)) {
    Http::json(['ok' => false], 429);
}
$st = Db::get()->prepare('INSERT INTO events_daily (day, type, count) VALUES (?,?,?) ON DUPLICATE KEY UPDATE count = count + VALUES(count)');
$day = gmdate('Y-m-d');
foreach ((array) ($in['counts'] ?? []) as $type => $n) {
    $n = (int) $n;
    if (in_array($type, $allowed, true) && $n > 0) {
        $st->execute([$day, $type, min($n, 50)]);
    }
}
Http::json(['ok' => true]);
