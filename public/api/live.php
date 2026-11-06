<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Http;
use Chua\Realtime\PollHub;

// Live visitors on shared hosting (realtime.mode = 'poll'). POST {a: join|sync|leave, ...}
Http::requireMethod('POST');
$rt = chua_config()['realtime'];
if (!$rt['enabled'] || ($rt['mode'] ?? 'ws') !== 'poll') {
    Http::json(['t' => 'error', 'code' => 'off'], 404);
}
$in = Http::input(16384);
switch ($in['a'] ?? '') {
    case 'join':
        $ip = Http::ipHash();
        if (!Http::allow('join:' . $ip, 30, 600)) {
            Http::json(['t' => 'error', 'code' => 'slow', 'text' => 'Too many tries. Please wait a few minutes.'], 429);
        }
        Http::json(PollHub::join($in, $ip));
    case 'sync':
        Http::json(PollHub::sync($in));
    case 'leave':
        PollHub::leave((string) ($in['sid'] ?? ''));
        Http::json(['ok' => true]);
    default:
        Http::json(['t' => 'error', 'code' => 'bad'], 400);
}
