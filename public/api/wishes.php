<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Bus;
use Chua\Db;
use Chua\Http;
use Chua\NameFilter;

// GET: latest visible wishes. POST {token, text}: hang a new wish on the wishing tree.
$pdo = Db::get();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $rows = $pdo->query("SELECT name, text, created_at FROM wishes WHERE status = 'visible' ORDER BY id DESC LIMIT 40")->fetchAll();
    Http::json(['wishes' => $rows]);
}
Http::requireMethod('POST');
$in = Http::input();
$guest = Http::guestByToken((string) ($in['token'] ?? ''));
if ($guest === null) {
    Http::json(['error' => 'session', 'text' => 'Please enter the temple first.'], 401);
}
$ipHash = Http::ipHash();
if (!Http::allow('wish:' . $ipHash, 3, 600)) {
    Http::json(['error' => 'slow', 'text' => 'You can hang three wishes every ten minutes.'], 429);
}
$raw = trim((string) ($in['text'] ?? ''));
if (mb_strlen($raw) < 3) {
    Http::json(['error' => 'short', 'text' => 'Write a few words for your wish.'], 422);
}
$status = NameFilter::isOffensive($raw) ? 'pending' : 'visible';
$text = NameFilter::maskText($raw, 140);
$pdo->prepare('INSERT INTO wishes (guest_id, name, text, status, ip_hash, created_at) VALUES (?,?,?,?,?,?)')
    ->execute([$guest['id'], $guest['name'], $text, $status, $ipHash, Db::now()]);
if ($status === 'visible') {
    Chua\Events::publish('wish', ['name' => $guest['name']]);
}
Http::json(['ok' => true, 'status' => $status, 'wish' => ['name' => $guest['name'], 'text' => $text]]);
