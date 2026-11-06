<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Bus;
use Chua\Db;
use Chua\Http;

$pdo = Db::get();
$st = $pdo->prepare("SELECT type, count FROM events_daily WHERE day = ? AND type IN ('incense','visit')");
$st->execute([gmdate('Y-m-d')]);
$today = array_column($st->fetchAll(), 'count', 'type');
$st = $pdo->prepare('SELECT COUNT(*) FROM candles WHERE expires_at > ?');
$st->execute([Db::now()]);
header('Cache-Control: max-age=10');
Http::json([
    'online' => Bus::fromConfig()->onlineTotal() ?? (chua_config()['realtime']['enabled'] && (chua_config()['realtime']['mode'] ?? 'ws') === 'poll' ? Chua\Realtime\PollHub::online(microtime(true)) : null),
    'incense_today' => (int) ($today['incense'] ?? 0),
    'visits_today' => (int) ($today['visit'] ?? 0),
    'candles_active' => (int) $st->fetchColumn(),
]);
