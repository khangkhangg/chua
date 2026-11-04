<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';

use Chua\Db;

$config = chua_config();
$e = static fn ($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$pdo = Db::get();
$days = $pdo->query("SELECT DATE(paid_at) d, COUNT(*) n, SUM(amount) total FROM candle_orders WHERE status = 'paid' AND paid_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) GROUP BY DATE(paid_at) ORDER BY d DESC")->fetchAll();
$all = $pdo->query("SELECT COUNT(*) n, COALESCE(SUM(amount),0) total FROM candle_orders WHERE status = 'paid'")->fetch();
$st = $pdo->prepare('SELECT COUNT(*) FROM candles WHERE expires_at > ?');
$st->execute([Db::now()]);
$burning = (int) $st->fetchColumn();
$vnd = static fn ($n): string => number_format((int) $n, 0, ',', '.') . ' ₫';
?><!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Công đức · <?= $e($config['temple_name']) ?></title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600&family=Noto+Serif+Display:wght@600&display=swap">
<style>
:root{--bg:#140c08;--panel:#21150e;--gold:#d9aa4a;--paper:#f4e7c9;--muted:#c2ad8c;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--paper);font:15px/1.6 "Be Vietnam Pro",system-ui,sans-serif;padding:32px max(16px,env(safe-area-inset-left))}
main{max-width:720px;margin:0 auto}
h1{font:600 32px/1.15 "Noto Serif Display",Georgia,serif;margin:0 0 6px}
p{color:var(--muted);max-width:62ch}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}
.tile{background:var(--panel);border:1px solid #5a4420;border-radius:4px;padding:14px}
.tile b{display:block;font-size:24px;color:var(--gold);font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:8px 10px;border-bottom:1px solid #3a2a18;text-align:left}
td.n{text-align:right}
a{color:var(--gold)}
</style>
</head>
<body>
<main>
<h1>Công đức đèn nến</h1>
<p>Every candle offered at <?= $e($config['temple_name']) ?> is listed here by day, so anyone can see what was received. Names and wishes stay private; only totals are shown.</p>
<div class="tiles">
  <div class="tile"><b><?= $vnd($all['total']) ?></b>received in total</div>
  <div class="tile"><b><?= (int) $all['n'] ?></b>candles offered</div>
  <div class="tile"><b><?= $burning ?></b>burning right now</div>
</div>
<table>
<thead><tr><th>Day (UTC)</th><th class="n">Candles</th><th class="n">Received</th></tr></thead>
<tbody>
<?php if (!$days): ?><tr><td colspan="3">No candles in the last 30 days yet.</td></tr><?php endif; ?>
<?php foreach ($days as $d): ?><tr><td><?= $e($d['d']) ?></td><td class="n"><?= (int) $d['n'] ?></td><td class="n"><?= $vnd($d['total']) ?></td></tr><?php endforeach; ?>
</tbody>
</table>
<p><a href="./">Back to the temple</a></p>
</main>
</body>
</html>
