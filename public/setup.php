<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';

use Chua\Setup;

header('X-Frame-Options: DENY');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
$e = static fn ($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$siteHost = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');

if (!Setup::needed()) {
    http_response_code(403);
    echo '<!doctype html><meta charset="utf-8"><title>Setup is done</title><body style="font:16px system-ui;background:#140c08;color:#f4e7c9;padding:40px">'
        . '<h1 style="font-weight:600">Setup is already done</h1><p>The settings file exists, so this page is locked. To run setup again, delete <code>config.local.php</code> on the server.</p><p><a style="color:#d9aa4a" href="./">Go to the temple</a></p>';
    exit;
}

session_name('chua_setup');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(16));

// requirements
$req = [
    ['PHP 8.1 or newer', version_compare(PHP_VERSION, '8.1.0', '>='), 'This server runs PHP ' . PHP_VERSION . '. Choose a newer PHP version in your hosting panel.', true],
    ['MySQL driver (pdo_mysql)', extension_loaded('pdo_mysql'), 'Turn on the pdo_mysql extension in your hosting panel.', true],
    ['mbstring', extension_loaded('mbstring'), 'Turn on the mbstring extension.', true],
    ['intl (better name checks)', extension_loaded('intl'), 'Optional. Turn on intl for better handling of Vietnamese names.', false],
    ['Settings folder writable', is_writable(dirname(Setup::configPath())), 'The setup page cannot save config.local.php itself; it will show the file for you to upload.', false],
];
$blocked = (bool) array_filter($req, static fn ($r) => !$r[1] && $r[3]);

$errors = [];
$done = null;
$f = $_POST;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$blocked) {
    if (!hash_equals($_SESSION['csrf'], (string) ($f['csrf'] ?? ''))) {
        $errors[] = 'The form expired. Please submit it again.';
    } else {
        [$values, $errors] = Setup::fromForm($f, $siteHost);
        if (!$errors) {
            $db = Setup::connect($values['db']['dsn'], $values['db']['user'], $values['db']['pass']);
            if (!$db['ok']) {
                $errors[] = $db['error'];
            } else {
                try {
                    $tables = Setup::installSchema($db['pdo']);
                    $php = Setup::renderConfig($values);
                    $written = Setup::writeConfig($php);
                    $done = ['values' => $values, 'tables' => $tables, 'written' => $written, 'php' => $php, 'version' => $db['version']];
                    $_SESSION = [];
                } catch (\Throwable $ex) {
                    $errors[] = 'Creating the tables failed: ' . mb_substr($ex->getMessage(), 0, 200);
                }
            }
        }
    }
}
$v = static fn (string $k, string $d = '') => $e($f[$k] ?? $d);
$hosting = ($f['hosting'] ?? 'shared') === 'vps' ? 'vps' : 'shared';
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Set up the temple</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600&family=Noto+Serif+Display:wght@600&display=swap">
<style>
:root{--bg:#140c08;--panel:#21150e;--line:#4a3820;--gold:#d9aa4a;--paper:#f4e7c9;--muted:#c2ad8c;--ok:#7fb85a;--bad:#ff9c8a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--paper);font:15px/1.55 "Be Vietnam Pro",system-ui,sans-serif;padding:32px max(16px,env(safe-area-inset-left)) 48px}
main{max-width:720px;margin:0 auto;display:grid;gap:18px}
h1{font:600 32px/1.15 "Noto Serif Display",Georgia,serif;margin:0}
h2{font:600 17px/1.3 "Be Vietnam Pro",sans-serif;margin:0 0 10px;color:var(--gold)}
p{margin:0 0 8px;color:var(--muted);max-width:64ch}
section{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:18px}
.req{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:14px}
.req li{display:flex;gap:8px}
.req b{width:18px;flex:none}
.req .ok b{color:var(--ok)} .req .bad b{color:var(--bad)} .req .warn b{color:var(--gold)}
.req small{display:block;color:var(--muted)}
.choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:620px){.choices{grid-template-columns:1fr}}
.choice{display:block;border:1px solid var(--line);border-radius:6px;padding:14px;cursor:pointer;background:rgba(0,0,0,.2)}
.choice:has(input:checked){border-color:var(--gold);background:rgba(217,170,74,.1)}
.choice input{margin:0 8px 0 0}
.choice b{font-size:16px}
.choice span{display:block;color:var(--muted);font-size:13.5px;margin-top:6px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:620px){.grid{grid-template-columns:1fr}}
label.f{display:grid;gap:5px;font-size:13px;color:var(--muted)}
input[type=text],input[type=password],input[type=number],select{font:inherit;color:var(--paper);background:#140c08;border:1px solid var(--line);border-radius:4px;padding:9px 10px;width:100%}
input:focus-visible,button:focus-visible,select:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
.check{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-top:10px}
details summary{cursor:pointer;color:var(--gold);font-weight:600}
.vps-only{display:none}
form:has(input[value=vps]:checked) .vps-only{display:block}
button{font:600 15px/1 "Be Vietnam Pro",sans-serif;color:#241508;background:var(--gold);border:0;border-radius:4px;padding:13px 20px;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
.errors{border-color:#8a3a2a;background:#2a120c}
.errors li{color:var(--bad)}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
pre{background:#0d0806;border:1px solid var(--line);border-radius:4px;padding:12px;overflow-x:auto;white-space:pre}
ol{margin:0;padding-left:20px;display:grid;gap:8px}
a{color:var(--gold)}
</style>
</head>
<body>
<main>
<?php if ($done): $vals = $done['values']; $isVps = $vals['realtime']['mode'] === 'ws'; ?>
  <h1>The temple is set up</h1>
  <section>
    <h2>Done</h2>
    <p>Connected to the database (<?= $e($done['version']) ?>) and created the tables from <?= $e(implode(', ', $done['tables'])) ?>.</p>
    <?php if ($done['written']): ?>
      <p>Saved the settings in <code>config.local.php</code>. This setup page is now locked.</p>
    <?php else: ?>
      <p><b style="color:var(--paper)">One more step:</b> this server would not let the page save the settings file. Create a file named <code>config.local.php</code> next to <code>config.php</code> (in your hosting file manager) with exactly this content:</p>
      <pre><?= $e($done['php']) ?></pre>
    <?php endif; ?>
  </section>
  <section>
    <h2>Next steps for <?= $isVps ? 'your VPS' : 'shared hosting' ?></h2>
    <?php if ($isVps): ?>
    <ol>
      <li>Start the live server as a service (SSH into the VPS, from the site folder):<pre>sudo cp realtime/chua-realtime.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now chua-realtime</pre>Edit the paths in that file first if the site is not in <code>/var/www/duykhang/chua</code>.</li>
      <li>Send <code>/ws</code> to the live server in nginx (the full block is in <code>DEPLOY.md</code>, step 6), then reload nginx.</li>
      <li><button type="button" id="wsTest">Check the live server</button> <span id="wsResult"></span></li>
      <li>Open <a href="./">the temple</a> in two browsers and walk up to each other.</li>
    </ol>
    <?php else: ?>
    <ol>
      <li>Nothing else to install: visitors see each other through the site itself, each page checking in about once a second.</li>
      <li>Open <a href="./">the temple</a> in two browsers and walk up to each other.</li>
      <li>Shared hosting carries about 50 to 150 people at once, depending on the plan. When you need more, move to a VPS and run setup again with that choice.</li>
    </ol>
    <?php endif; ?>
    <p style="margin-top:12px">Sign in to <a href="admin/">the admin page</a> with the password you chose. <?= $vals['payments']['enabled'] ? 'Candle payments are on: register the payment webhook at <code>' . $e($vals['base_url']) . '/api/payment-webhook.php</code> in your SePay or PayOS dashboard, then offer a 10.000 ₫ candle to test it.' : 'Candle payments are off. To turn them on later, add your bank details to <code>config.local.php</code> (see <code>config.local.example.php</code>).' ?></p>
  </section>
  <?php if ($isVps): ?>
  <script>
  document.getElementById('wsTest').addEventListener('click', () => {
    const out = document.getElementById('wsResult'); out.textContent = 'Connecting…';
    let ws; try { ws = new WebSocket(<?= json_encode($vals['realtime']['public_url']) ?>); } catch (e) { out.textContent = 'The address is not valid.'; return; }
    const timer = setTimeout(() => { out.textContent = 'No answer yet. Check that the service is running and nginx sends /ws to it.'; try { ws.close(); } catch (e) {} }, 6000);
    ws.onopen = () => { clearTimeout(timer); out.textContent = 'The live server answers.'; ws.close(); };
    ws.onerror = () => { clearTimeout(timer); out.textContent = 'Could not connect. Check that the service is running and nginx sends /ws to it.'; };
  });
  </script>
  <?php endif; ?>
<?php else: ?>
  <h1>Set up the temple</h1>
  <p>This page runs once, on a fresh install. It checks the server, connects to your database, creates the tables and saves the settings. Have your database name, user and password ready (create them in your hosting panel first).</p>

  <section>
    <h2>This server</h2>
    <ul class="req">
      <?php foreach ($req as [$label, $ok, $help, $must]): ?>
        <li class="<?= $ok ? 'ok' : ($must ? 'bad' : 'warn') ?>"><b><?= $ok ? '✓' : ($must ? '✕' : '!') ?></b><div><?= $e($label) ?><?php if (!$ok): ?><small><?= $e($help) ?></small><?php endif; ?></div></li>
      <?php endforeach; ?>
    </ul>
  </section>

  <?php if ($errors): ?>
  <section class="errors"><ul><?php foreach ($errors as $er): ?><li><?= $e($er) ?></li><?php endforeach; ?></ul></section>
  <?php endif; ?>

  <form method="post" autocomplete="off">
    <input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf']) ?>">
    <div style="display:grid;gap:18px">
    <section>
      <h2>1. Where is it hosted?</h2>
      <div class="choices">
        <label class="choice"><input type="radio" name="hosting" value="shared" <?= $hosting === 'shared' ? 'checked' : '' ?>><b>Shared hosting</b>
          <span>Hostinger, cPanel and similar. Nothing to install: visitors see each other through the site itself, checking in about once a second. About 50 to 150 people at once.</span></label>
        <label class="choice"><input type="radio" name="hosting" value="vps" <?= $hosting === 'vps' ? 'checked' : '' ?>><b>VPS or own server</b>
          <span>You can run a background service and edit nginx. A live server sends 10 updates a second; about 1,000 people per server, thousands with OpenSwoole, more with extra servers.</span></label>
      </div>
      <div class="vps-only" style="margin-top:14px">
        <div class="grid">
          <label class="f">Live server address<input type="text" name="ws_url" value="<?= $v('ws_url', 'wss://' . $siteHost . '/ws') ?>"></label>
        </div>
        <label class="check"><input type="checkbox" name="redis" value="1" <?= !empty($f['redis']) ? 'checked' : '' ?>> Redis is installed (needed for a visitor count across servers and for more than one live server)</label>
      </div>
    </section>

    <section>
      <h2>2. Database</h2>
      <p>MySQL or MariaDB on this server. On Hostinger: hPanel → Databases → MySQL Databases.</p>
      <div class="grid">
        <label class="f">Address<input type="text" name="db_host" value="<?= $v('db_host', 'localhost') ?>" required></label>
        <label class="f">Port (blank for the usual one)<input type="number" name="db_port" value="<?= $v('db_port') ?>"></label>
        <label class="f">Database name<input type="text" name="db_name" value="<?= $v('db_name') ?>" required></label>
        <label class="f">User<input type="text" name="db_user" value="<?= $v('db_user') ?>" required></label>
        <label class="f">Password<input type="password" name="db_pass" autocomplete="new-password"></label>
      </div>
    </section>

    <section>
      <h2>3. The temple</h2>
      <div class="grid">
        <label class="f">Temple name<input type="text" name="temple_name" maxlength="60" value="<?= $v('temple_name', 'An Tâm Nam Chùa') ?>"></label>
        <span></span>
        <label class="f">Admin password (10 characters or more)<input type="password" name="admin_pass" minlength="10" required autocomplete="new-password"></label>
        <label class="f">Admin password again<input type="password" name="admin_pass2" minlength="10" required autocomplete="new-password"></label>
      </div>
      <label class="check"><input type="checkbox" name="cloudflare" value="1" <?= !empty($f['cloudflare']) || !$f ? 'checked' : '' ?>> The site is behind Cloudflare</label>
    </section>

    <section>
      <details <?= !empty($f['pay_on']) ? 'open' : '' ?>>
        <summary>4. Candle payments (optional, can be added later)</summary>
        <label class="check"><input type="checkbox" name="pay_on" value="1" <?= !empty($f['pay_on']) ? 'checked' : '' ?>> Turn on candle offerings by bank transfer</label>
        <div class="grid" style="margin-top:10px">
          <label class="f">Payment notices from<select name="pay_provider"><option value="sepay">SePay</option><option value="payos" <?= ($f['pay_provider'] ?? '') === 'payos' ? 'selected' : '' ?>>PayOS</option></select></label>
          <label class="f">Bank BIN (6 digits, e.g. 970436 Vietcombank)<input type="text" name="pay_bin" value="<?= $v('pay_bin') ?>"></label>
          <label class="f">Account number<input type="text" name="pay_account" value="<?= $v('pay_account') ?>"></label>
          <label class="f">Account name (as the bank prints it)<input type="text" name="pay_name" value="<?= $v('pay_name') ?>"></label>
          <label class="f">Bank name shown to visitors<input type="text" name="pay_label" value="<?= $v('pay_label') ?>"></label>
          <label class="f">SePay webhook API key<input type="password" name="pay_sepay_key" autocomplete="off"></label>
          <label class="f">PayOS checksum key<input type="password" name="pay_payos_key" autocomplete="off"></label>
        </div>
      </details>
    </section>

    <div><button type="submit" <?= $blocked ? 'disabled' : '' ?>>Check the database and set up</button></div>
    </div>
  </form>
<?php endif; ?>
</main>
</body>
</html>
