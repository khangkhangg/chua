<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Db;
use Chua\Http;

// The latest visitors who entered, newest first. Only the name they chose, which other visitors
// already see above their avatar in the courtyard; never the token or the IP hash.
$rows = Db::get()->query('SELECT name, created_at FROM guests ORDER BY id DESC LIMIT 8')->fetchAll(PDO::FETCH_ASSOC);
$now = time();
header('Cache-Control: max-age=10');
Http::json(['arrivals' => array_map(
    fn(array $r): array => ['name' => $r['name'], 'ago' => max(0, $now - strtotime($r['created_at'] . ' UTC'))],
    $rows
)]);
