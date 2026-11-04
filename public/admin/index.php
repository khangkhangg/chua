<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Bus;
use Chua\Db;

$config = chua_config();
session_name('chua_admin');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https']);
session_start();
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');
$e = static fn ($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$hash = (string) $config['admin']['password_hash'];
$error = '';

if (isset($_POST['password'])) {
    if ($hash !== '' && password_verify((string) $_POST['password'], $hash)) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        header('Location: ./');
        exit;
    }
    usleep(400000);
    $error = $hash === '' ? 'Set admin.password_hash in config.local.php first.' : 'Wrong password.';
}
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ./');
    exit;
}
$in = !empty($_SESSION['admin']);
$pdo = $in ? Db::get() : null;

if ($in && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do'])) {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Bad form token. Go back and reload.');
    }
    $id = (int) ($_POST['id'] ?? 0);
    match ($_POST['do']) {
        'wish_hide' => $pdo->prepare("UPDATE wishes SET status = 'hidden' WHERE id = ?")->execute([$id]),
        'wish_show' => $pdo->prepare("UPDATE wishes SET status = 'visible' WHERE id = ?")->execute([$id]),
        'report_close' => $pdo->prepare("UPDATE reports SET status = 'closed' WHERE id = ?")->execute([$id]),
        'ban_name' => $pdo->prepare("INSERT IGNORE INTO bans (kind, value, reason, created_at) VALUES ('name', ?, ?, ?)")->execute([mb_strtolower(trim((string) $_POST['value'])), (string) ($_POST['reason'] ?? ''), Db::now()]),
        'ban_ip' => $pdo->prepare("INSERT IGNORE INTO bans (kind, value, reason, created_at) VALUES ('ip', ?, ?, ?)")->execute([(string) $_POST['value'], (string) ($_POST['reason'] ?? ''), Db::now()]),
        'unban' => $pdo->prepare('DELETE FROM bans WHERE id = ?')->execute([$id]),
        default => null,
    };
    header('Location: ./?tab=' . urlencode((string) ($_POST['tab'] ?? 'overview')));
    exit;
}
$tab = (string) ($_GET['tab'] ?? 'overview');
$csrf = $_SESSION['csrf'] ?? '';
$form = static function (string $do, array $fields, string $label, string $tab) use ($csrf, $e): string {
    $h = '<form method="post" class="inline"><input type="hidden" name="csrf" value="' . $e($csrf) . '"><input type="hidden" name="do" value="' . $e($do) . '"><input type="hidden" name="tab" value="' . $e($tab) . '">';
    foreach ($fields as $k => $v) {
        $h .= '<input type="hidden" name="' . $e($k) . '" value="' . $e($v) . '">';
    }
    return $h . '<button>' . $e($label) . '</button></form>';
};
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Temple admin</title>
<style>
:root{--bg:#140c08;--panel:#21150e;--line:#3a2a18;--gold:#d9aa4a;--paper:#f4e7c9;--muted:#c2ad8c;--red:#c2412b;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--paper);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px max(16px,env(safe-area-inset-left))}
main{max-width:1100px;margin:0 auto}
h1{font-size:20px;margin:0 0 12px}
nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
nav a{color:var(--paper);text-decoration:none;padding:6px 12px;border:1px solid var(--line);border-radius:3px}
nav a.on{background:var(--gold);color:#241508;border-color:var(--gold)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:18px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:12px}
.tile b{display:block;font-size:22px;color:var(--gold);font-variant-numeric:tabular-nums}
.wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}
form.inline{display:inline}
button,input,select{font:inherit;color:var(--paper);background:#2b1d12;border:1px solid #5a4420;border-radius:3px;padding:5px 9px}
button{cursor:pointer}
.err{color:#ff9c8a}
.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:12px;border:1px solid var(--line)}
.pill.open,.pill.pending{border-color:var(--red);color:#ffb3a5}
</style>
</head>
<body>
<main>
<?php if (!$in): ?>
<h1>Temple admin</h1>
<form method="post"><label>Password <input type="password" name="password" autofocus autocomplete="current-password"></label> <button>Sign in</button></form>
<?php if ($error): ?><p class="err"><?= $e($error) ?></p><?php endif; ?>
<?php else: ?>
<h1><?= $e($config['temple_name']) ?> · admin <a href="?logout=1" style="float:right;color:var(--muted);font-size:13px">Sign out</a></h1>
<nav>
<?php foreach (['overview' => 'Overview', 'reports' => 'Reports', 'wishes' => 'Wishes', 'chat' => 'Chat log', 'candles' => 'Candles', 'bans' => 'Bans'] as $k => $label): ?>
<a href="?tab=<?= $k ?>" class="<?= $tab === $k ? 'on' : '' ?>"><?= $label ?></a>
<?php endforeach; ?>
</nav>
<?php if ($tab === 'overview'):
    $openReports = (int) $pdo->query("SELECT COUNT(*) FROM reports WHERE status = 'open'")->fetchColumn();
    $pendingWishes = (int) $pdo->query("SELECT COUNT(*) FROM wishes WHERE status = 'pending'")->fetchColumn();
    $today = $pdo->query("SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM candle_orders WHERE status='paid' AND paid_at >= UTC_DATE()")->fetch();
    $online = Bus::fromConfig()->onlineTotal();
    $events = $pdo->query('SELECT day, type, count FROM events_daily WHERE day >= DATE_SUB(UTC_DATE(), INTERVAL 13 DAY) ORDER BY day DESC, type')->fetchAll();
    $types = array_values(array_unique(array_column($events, 'type')));
    $byDay = [];
    foreach ($events as $ev) { $byDay[$ev['day']][$ev['type']] = $ev['count']; }
?>
<div class="tiles">
  <div class="tile"><b><?= $online === null ? '–' : (int) $online ?></b>online now<?= $online === null ? ' (needs Redis)' : '' ?></div>
  <div class="tile"><b><?= (int) $today['n'] ?></b>candles paid today</div>
  <div class="tile"><b><?= number_format((int) $today['s'], 0, ',', '.') ?> ₫</b>received today</div>
  <div class="tile"><b><?= $openReports ?></b>open reports</div>
  <div class="tile"><b><?= $pendingWishes ?></b>wishes waiting for review</div>
</div>
<h2 style="font-size:15px">Last 14 days (UTC)</h2>
<div class="wrap"><table><thead><tr><th>Day</th><?php foreach ($types as $t): ?><th><?= $e($t) ?></th><?php endforeach; ?></tr></thead><tbody>
<?php foreach ($byDay as $day => $row): ?><tr><td><?= $e($day) ?></td><?php foreach ($types as $t): ?><td><?= (int) ($row[$t] ?? 0) ?></td><?php endforeach; ?></tr><?php endforeach; ?>
<?php if (!$byDay): ?><tr><td>No activity yet.</td></tr><?php endif; ?>
</tbody></table></div>
<?php elseif ($tab === 'reports'): $rows = $pdo->query('SELECT * FROM reports ORDER BY status = \'open\' DESC, id DESC LIMIT 200')->fetchAll(); ?>
<div class="wrap"><table><thead><tr><th>When</th><th>Reported</th><th>By</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr><td><?= $e($r['created_at']) ?></td><td><?= $e($r['reported']) ?></td><td><?= $e($r['reporter']) ?></td><td><?= $e($r['reason']) ?></td><td><span class="pill <?= $e($r['status']) ?>"><?= $e($r['status']) ?></span></td>
<td><?= $r['status'] === 'open' ? $form('report_close', ['id' => $r['id']], 'Close', $tab) : '' ?> <?= $form('ban_name', ['value' => $r['reported'], 'reason' => 'report #' . $r['id']], 'Ban name', $tab) ?> <?= $r['reported_ip_hash'] ? $form('ban_ip', ['value' => $r['reported_ip_hash'], 'reason' => 'report #' . $r['id']], 'Ban network', $tab) : '' ?></td></tr><?php endforeach; ?>
<?php if (!$rows): ?><tr><td colspan="6">No reports.</td></tr><?php endif; ?>
</tbody></table></div>
<?php elseif ($tab === 'wishes'): $rows = $pdo->query('SELECT * FROM wishes ORDER BY status = \'pending\' DESC, id DESC LIMIT 200')->fetchAll(); ?>
<div class="wrap"><table><thead><tr><th>When</th><th>Name</th><th>Wish</th><th>Status</th><th></th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr><td><?= $e($r['created_at']) ?></td><td><?= $e($r['name']) ?></td><td><?= $e($r['text']) ?></td><td><span class="pill <?= $e($r['status']) ?>"><?= $e($r['status']) ?></span></td>
<td><?= $r['status'] !== 'hidden' ? $form('wish_hide', ['id' => $r['id']], 'Hide', $tab) : '' ?> <?= $r['status'] !== 'visible' ? $form('wish_show', ['id' => $r['id']], 'Show', $tab) : '' ?></td></tr><?php endforeach; ?>
<?php if (!$rows): ?><tr><td colspan="5">No wishes yet.</td></tr><?php endif; ?>
</tbody></table></div>
<?php elseif ($tab === 'chat'): $rows = $pdo->query('SELECT * FROM chat_log ORDER BY id DESC LIMIT 300')->fetchAll(); ?>
<div class="wrap"><table><thead><tr><th>When</th><th>Courtyard</th><th>Name</th><th>Message</th><th></th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr><td><?= $e($r['created_at']) ?></td><td><?= $e($r['shard']) ?></td><td><?= $e($r['name']) ?></td><td><?= $e($r['text']) ?></td><td><?= $form('ban_name', ['value' => $r['name'], 'reason' => 'chat'], 'Ban name', $tab) ?> <?= $form('ban_ip', ['value' => $r['ip_hash'], 'reason' => 'chat'], 'Ban network', $tab) ?></td></tr><?php endforeach; ?>
<?php if (!$rows): ?><tr><td colspan="5">No messages yet.</td></tr><?php endif; ?>
</tbody></table></div>
<?php elseif ($tab === 'candles'): $rows = $pdo->query('SELECT o.*, (SELECT COUNT(*) FROM payments p WHERE p.order_id = o.id) pays FROM candle_orders o ORDER BY id DESC LIMIT 200')->fetchAll();
    $unmatched = $pdo->query('SELECT * FROM payments WHERE order_id IS NULL ORDER BY id DESC LIMIT 50')->fetchAll(); ?>
<div class="wrap"><table><thead><tr><th>Created</th><th>Code</th><th>Name</th><th>Size</th><th>Amount</th><th>Status</th><th>Paid</th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr><td><?= $e($r['created_at']) ?></td><td><?= $e($r['code']) ?></td><td><?= $e($r['name']) ?></td><td><?= $e($r['size']) ?></td><td><?= number_format((int) $r['amount'], 0, ',', '.') ?></td><td><span class="pill"><?= $e($r['status']) ?></span></td><td><?= $e($r['paid_at'] ?? '') ?></td></tr><?php endforeach; ?>
<?php if (!$rows): ?><tr><td colspan="7">No orders yet.</td></tr><?php endif; ?>
</tbody></table></div>
<h2 style="font-size:15px">Transfers that matched no order</h2>
<p style="color:var(--muted)">Usually a typo in the memo. Check the content and refund or light the candle by hand.</p>
<div class="wrap"><table><thead><tr><th>When</th><th>Provider</th><th>Amount</th><th>Memo</th></tr></thead><tbody>
<?php foreach ($unmatched as $r): ?><tr><td><?= $e($r['created_at']) ?></td><td><?= $e($r['provider']) ?></td><td><?= number_format((int) $r['amount'], 0, ',', '.') ?></td><td><?= $e($r['content']) ?></td></tr><?php endforeach; ?>
<?php if (!$unmatched): ?><tr><td colspan="4">None.</td></tr><?php endif; ?>
</tbody></table></div>
<?php elseif ($tab === 'bans'): $rows = $pdo->query('SELECT * FROM bans ORDER BY id DESC')->fetchAll(); ?>
<form method="post" style="margin-bottom:14px"><input type="hidden" name="csrf" value="<?= $e($csrf) ?>"><input type="hidden" name="tab" value="bans"><input type="hidden" name="do" value="ban_name">
<input name="value" placeholder="Name to ban" required> <input name="reason" placeholder="Reason"> <button>Ban name</button></form>
<div class="wrap"><table><thead><tr><th>Kind</th><th>Value</th><th>Reason</th><th>Since</th><th></th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr><td><?= $e($r['kind']) ?></td><td><?= $e($r['kind'] === 'ip' ? substr($r['value'], 0, 12) . '…' : $r['value']) ?></td><td><?= $e($r['reason']) ?></td><td><?= $e($r['created_at']) ?></td><td><?= $form('unban', ['id' => $r['id']], 'Remove', $tab) ?></td></tr><?php endforeach; ?>
<?php if (!$rows): ?><tr><td colspan="5">No bans.</td></tr><?php endif; ?>
</tbody></table></div>
<?php endif; ?>
<?php endif; ?>
</main>
</body>
</html>
