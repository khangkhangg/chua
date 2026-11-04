<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Db;
use Chua\Http;
use Chua\NameFilter;

// POST {name} -> a guest token the realtime server and the APIs accept.
Http::requireMethod('POST');
$in = Http::input();
$ipHash = Http::ipHash();
if (!Http::allow('session:' . $ipHash, 20, 600)) {
    Http::json(['error' => 'slow', 'text' => 'Too many tries. Please wait a few minutes.'], 429);
}
$name = NameFilter::cleanName((string) ($in['name'] ?? ''));
if ($name === null) {
    Http::json(['error' => 'name', 'text' => 'Please choose another name: 2 to 18 letters, no rude words, not a monk or staff title.'], 422);
}
if (Http::isBanned($name, $ipHash)) {
    Http::json(['error' => 'banned', 'text' => 'This visitor cannot enter right now.'], 403);
}
$token = bin2hex(random_bytes(32));
$now = Db::now();
Db::get()->prepare('INSERT INTO guests (token, name, ip_hash, created_at, last_seen) VALUES (?,?,?,?,?)')
    ->execute([$token, $name, $ipHash, $now, $now]);
Http::json(['ok' => true, 'name' => $name, 'token' => $token]);
