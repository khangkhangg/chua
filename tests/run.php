<?php
declare(strict_types=1);

// php tests/run.php   (needs MySQL/MariaDB with a chua_test database loaded from sql/001_schema.sql)
putenv('CHUA_CONFIG_LOCAL=' . __DIR__ . '/config.test.php');
require dirname(__DIR__) . '/src/bootstrap.php';

use Chua\Db;
use Chua\NameFilter;
use Chua\Payment\Orders;
use Chua\Payment\VietQR;
use Chua\Payment\Webhooks;
use Chua\Realtime\Codec;
use Chua\Realtime\Hub;
use Chua\Realtime\Player;
use Chua\Realtime\Services;
use Chua\Realtime\Shard;
use Chua\Realtime\Transport;

if (!str_contains(chua_config()['db']['dsn'], '_test')) {
    fwrite(STDERR, "Refusing to run: the database name must end in _test.\n");
    exit(1);
}

$passed = 0;
$failed = 0;
function check(string $name, bool $ok, string $detail = ''): void
{
    global $passed, $failed;
    if ($ok) {
        $passed++;
    } else {
        $failed++;
        fwrite(STDERR, "FAIL  $name" . ($detail !== '' ? "  ($detail)" : '') . "\n");
    }
}

// ---------- names and text ----------
check('plain name ok', NameFilter::cleanName('  Linh  ') === 'Linh');
check('vietnamese name ok', NameFilter::cleanName('Nguyễn Thị Hoa') === 'Nguyễn Thị Hoa');
check('common words are not rude', NameFilter::cleanName('Các Lớn') === 'Các Lớn');
check('too short', NameFilter::cleanName('A') === null);
check('too long', NameFilter::cleanName(str_repeat('a', 19)) === null);
check('symbols refused', NameFilter::cleanName('<script>') === null);
check('rude word refused', NameFilter::cleanName('đụ quá') === null);
check('english stem refused', NameFilter::cleanName('fuckboy') === null);
check('monk title refused', NameFilter::cleanName('Thích Minh') === null);
check('staff title refused', NameFilter::cleanName('admin') === null);
check('mask keeps clean text', NameFilter::maskText('Chúc mọi người bình an') === 'Chúc mọi người bình an');
check('mask hides rude word', NameFilter::maskText('đồ lồn quá') === 'đồ *** quá');
check('mask trims length', mb_strlen(NameFilter::maskText(str_repeat('á', 300), 140)) === 140);

// ---------- VietQR ----------
check('crc16 ccitt-false', VietQR::crc16('123456789') === '29B1');
$qr = VietQR::payload('970436', '0123456789', 20000, 'NENABC234');
check('qr has napas guid', str_contains($qr, 'A000000727'));
check('qr has amount', str_contains($qr, '540520000'));
check('qr has memo', str_contains($qr, '0809NENABC234'));
check('qr crc is valid', VietQR::crc16(substr($qr, 0, -4)) === substr($qr, -4));

// ---------- order codes ----------
check('code shape', (bool) preg_match('/^NEN[A-HJ-NP-Z2-9]{6}$/', Orders::newCode()));
check('code found in messy memo', Orders::findCode('MBVCB.123 nen-abc 234 chuyen tien') === 'NENABC234');
check('no code', Orders::findCode('chuyen tien an trua') === null);

// ---------- webhooks ----------
check('sepay wrong key', Webhooks::sepay(['id' => 1, 'transferType' => 'in'], 'Apikey nope', 'k') === null);
check('sepay no key configured', Webhooks::sepay(['id' => 1, 'transferType' => 'in'], 'Apikey ', '') === null);
$s = Webhooks::sepay(['id' => 7, 'transferType' => 'in', 'transferAmount' => 20000, 'content' => 'NENABC234'], 'Apikey k', 'k');
check('sepay parsed', $s !== null && $s['txn'] === 'sepay:7' && $s['amount'] === 20000);
check('sepay outgoing skipped', !empty(Webhooks::sepay(['id' => 8, 'transferType' => 'out'], 'Apikey k', 'k')['skip']));
$data = ['orderCode' => 123, 'amount' => 20000, 'description' => 'NENABC234', 'reference' => 'FT1', 'code' => '00', 'desc' => 'ok', 'counterAccountName' => null];
$body = ['data' => $data, 'signature' => Webhooks::payosSignature($data, 'pk')];
$p = Webhooks::payos($body, 'pk');
check('payos valid signature', $p !== null && $p['txn'] === 'payos:FT1');
$body['data']['amount'] = 1;
check('payos tampered refused', Webhooks::payos($body, 'pk') === null);

// ---------- orders against the test database ----------
$pdo = Db::get();
foreach (['payments', 'candles', 'candle_orders', 'rate_limits'] as $t) {
    $pdo->exec("DELETE FROM $t");
}
$o = Orders::create('Linh', 'bình an', 'medium', str_repeat('a', 64));
check('order amount', $o['amount'] === 20000);
check('order pending', Orders::status($o['code']) === 'pending');
check('short payment', Orders::applyPayment('sepay', 'sepay:1', 1000, 'CT ' . $o['code'], '{}') === 'short');
check('still pending', Orders::status($o['code']) === 'pending');
check('full payment', Orders::applyPayment('sepay', 'sepay:2', 20000, 'CT ' . strtolower($o['code']), '{}') === 'paid');
check('now paid', Orders::status($o['code']) === 'paid');
check('same transfer twice', Orders::applyPayment('sepay', 'sepay:2', 20000, 'CT ' . $o['code'], '{}') === 'duplicate');
check('second transfer for paid order', Orders::applyPayment('sepay', 'sepay:3', 20000, $o['code'], '{}') === 'already');
check('unmatched transfer', Orders::applyPayment('sepay', 'sepay:4', 50000, 'tien an', '{}') === 'unmatched');
$candles = Orders::activeCandles();
check('one candle burning', count($candles) === 1 && $candles[0]['name'] === 'Linh');
$pdo->prepare("UPDATE candle_orders SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR) WHERE status = 'pending'")->execute();
$o2 = Orders::create('An', '', 'small', str_repeat('b', 64));
$pdo->prepare('UPDATE candle_orders SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR) WHERE code = ?')->execute([$o2['code']]);
check('old unpaid order expires', Orders::status($o2['code']) === 'expired');

check('rate limit allows', Chua\Http::allow('t:x', 2, 60) && Chua\Http::allow('t:x', 2, 60));
check('rate limit blocks', !Chua\Http::allow('t:x', 2, 60));

// ---------- codec ----------
$m = Codec::decodeMove(Codec::encodeMove(-12.34, 30.5, 200, 3));
check('move roundtrip', $m !== null && abs($m['x'] + 12.34) < 0.03 && abs($m['z'] - 30.5) < 0.03 && $m['h'] === 200 && $m['pose'] === 3);
check('out of bounds refused', Codec::decodeMove(Codec::encodeMove(500, 0, 0, 0)) === null);
check('bad pose refused', Codec::decodeMove(Codec::encodeMove(0, 0, 0, 9)) === null);
check('wrong length refused', Codec::decodeMove("\x01\x00") === null);

// ---------- shard visibility ----------
$sh = new Shard('stest01');
for ($i = 0; $i < 100; $i++) {
    $pl = new Player($i + 1, 'P' . $i, [], 'h');
    $pl->x = $i * 0.5;
    $pl->z = 0;
    $sh->add($pl);
}
$vis = $sh->visibility(60, 40.0);
$first = reset($sh->players);
check('view capped at 60', count($vis[$first->id]) === 60);
$far = $vis[$first->id];
check('nearest first', max(array_map(static fn ($p) => $p->x, $far)) <= 30.0);
check('radius respected', count($sh->visibility(500, 5.0)[$first->id]) === 10);

// ---------- hub ----------
final class FakeOut implements Transport
{
    public array $sent = [];
    public array $closed = [];
    public function send(int $fd, string $data, bool $binary): void { $this->sent[$fd][] = [$binary, $data]; }
    public function close(int $fd): void { $this->closed[] = $fd; }
    public function json(int $fd, string $type): array
    {
        $out = [];
        foreach ($this->sent[$fd] ?? [] as [$bin, $d]) {
            if (!$bin && ($j = json_decode($d, true))['t'] === $type) {
                $out[] = $j;
            }
        }
        return $out;
    }
    public function lastBinary(int $fd): ?string
    {
        foreach (array_reverse($this->sent[$fd] ?? []) as [$bin, $d]) {
            if ($bin) {
                return $d;
            }
        }
        return null;
    }
}
final class FakeSvc implements Services
{
    public array $chats = [];
    public array $reports = [];
    public function guest(string $token): ?array { return $token === 'tok' ? ['name' => 'Guest From Db'] : null; }
    public function banned(string $name, string $ipHash): bool { return $name === 'Banned One'; }
    public function logChat(string $shard, string $name, string $ipHash, string $text): void { $this->chats[] = $text; }
    public function report(string $reporter, string $reported, string $reportedIpHash, string $reason, string $context): void { $this->reports[] = [$reporter, $reported]; }
    public function incenseToday(): int { return 42; }
}
$cfg = chua_config()['realtime'];
$cfg['shard_size'] = 3;
$out = new FakeOut();
$svc = new FakeSvc();
$hub = new Hub($cfg, $out, $svc, null);
$hello = static fn (array $extra = []) => json_encode($extra + ['t' => 'hello', 'name' => 'Linh', 'look' => ['outfit' => 'aodai', 'color' => '#b8322a']]);

$hub->open(1, 'ip1');
$hub->message(1, $hello(), false);
$w1 = $out->json(1, 'welcome')[0] ?? null;
check('welcome sent', $w1 !== null && $w1['name'] === 'Linh' && $w1['players'] === []);
$hub->open(2, 'ip2');
$hub->message(2, $hello(['name' => 'An', 'invite' => $w1['shard']]), false);
$w2 = $out->json(2, 'welcome')[0] ?? null;
check('invite joins same shard', $w2 !== null && $w2['shard'] === $w1['shard'] && count($w2['players']) === 1);
check('join announced', ($out->json(1, 'join')[0]['p']['name'] ?? '') === 'An');
$hub->open(3, 'ip3');
$hub->message(3, $hello(['token' => 'tok']), false);
check('token name wins', ($out->json(3, 'welcome')[0]['name'] ?? '') === 'Guest From Db');
$hub->open(4, 'ip4');
$hub->message(4, $hello(['name' => 'Zed', 'invite' => $w1['shard']]), false);
check('full shard sends to a new one', ($out->json(4, 'welcome')[0]['shard'] ?? '') !== $w1['shard']);
$hub->open(5, 'ip5');
$hub->message(5, $hello(['name' => 'đụ quá']), false);
check('bad name rejected', ($out->json(5, 'error')[0]['code'] ?? '') === 'name' && in_array(5, $out->closed, true));
$hub->open(6, 'ip6');
$hub->message(6, $hello(['name' => 'Banned One']), false);
check('banned rejected', ($out->json(6, 'error')[0]['code'] ?? '') === 'banned');
for ($i = 0; $i < 7; $i++) {
    $hub->open(100 + $i, 'same-ip');
}
check('per-network limit is six', in_array(106, $out->closed, true) && !in_array(105, $out->closed, true));

$hub->message(1, Codec::encodeMove(1.0, 2.0, 10, 4), true);
$hub->message(2, Codec::encodeMove(3.0, 2.0, 20, 0), true);
$hub->tick();
$bin = $out->lastBinary(2);
$state = $bin ? unpack('Ctype/vcount', $bin) : null;
check('state frame', $state !== null && $state['type'] === 2 && $state['count'] >= 1);
$entry = $bin ? unpack('vid/vx/vz/Ch/Cpose', substr($bin, 3, 8)) : null;
check('state carries pose', $entry !== null && $entry['pose'] === 4 && $entry['x'] === 50);

$hub->message(1, json_encode(['t' => 'chat', 'text' => 'Chúc bình an lồn']), false);
check('chat masked and logged', ($svc->chats[0] ?? '') === 'Chúc bình an ***');
check('chat reaches neighbour', ($out->json(2, 'chat')[0]['text'] ?? '') === 'Chúc bình an ***');
$hub->message(1, json_encode(['t' => 'chat', 'text' => 'again']), false);
check('chat flood slowed', ($out->json(1, 'error')[0]['code'] ?? '') === 'slow');
$hub->message(2, json_encode(['t' => 'act', 'a' => 'bell']), false);
check('bell goes to the shard', ($out->json(1, 'act')[0]['a'] ?? '') === 'bell');
$hub->message(2, json_encode(['t' => 'act', 'a' => 'dance']), false);
check('unknown action ignored', count($out->json(1, 'act')) === 1);
$hub->message(2, json_encode(['t' => 'report', 'id' => $w1['id'], 'reason' => 'rude']), false);
check('report stored', ($svc->reports[0] ?? []) === ['An', 'Linh']);
$hub->close(1);
check('leave announced', ($out->json(2, 'leave')[0]['id'] ?? 0) === $w1['id']);
check('metrics text', str_contains($hub->metrics(), 'chua_players '));

// ---------- rooms inside the halls ----------
$rs = new Shard('sroom01');
$people = [];
for ($i = 0; $i < 31; $i++) {
    $pl = new Player(500 + $i, 'R' . $i, [], 'h');
    $pl->x = 1.0;
    $pl->z = -14.0 + $i * 0.01;
    $rs->add($pl);
    $people[] = $pl;
}
foreach ($people as $pl) {
    $rs->enterRoom($pl, 0, 30);
}
check('first 30 share a room', count(array_filter($people, static fn ($p) => $p->room === 'h0#1')) === 30);
check('31st opens a second room', $people[30]->room === 'h0#2');
$outside = new Player(600, 'Out', [], 'h');
$outside->x = 1.0;
$outside->z = -14.0;
$rs->add($outside);
$v = $rs->visibility(60, 40.0);
check('room sees only its room', count($v[$people[0]->id]) === 29);
check('second room is alone', count($v[$people[30]->id]) === 0);
check('courtyard does not see into halls', count($v[$outside->id]) === 0);
$rs->enterRoom($people[0], -1, 30);
check('leaving a hall returns to the courtyard', $people[0]->room === '');

// ---------- live visitors by polling (shared hosting) ----------
use Chua\Realtime\PollHub;
foreach (['live_presence', 'live_events', 'reports', 'rate_limits'] as $t) {
    $pdo->exec("DELETE FROM $t");
}
$ja = PollHub::join(['name' => 'Linh', 'look' => ['outfit' => 'aodai', 'color' => '#B8322A']], 'ipa');
check('poll join welcome', ($ja['t'] ?? '') === 'welcome' && strlen($ja['sid']) === 32 && $ja['players'] === []);
$jb = PollHub::join(['name' => 'An', 'invite' => $ja['shard']], 'ipb');
check('poll invite joins same courtyard', $jb['shard'] === $ja['shard'] && count($jb['players']) === 1 && $jb['players'][0]['look']['color'] === '#b8322a');
check('poll seed follows courtyard', $jb['seed'] === $ja['seed']);
check('poll bad name refused', (PollHub::join(['name' => 'đụ quá'], 'ipc')['code'] ?? '') === 'name');
$sa = PollHub::sync(['sid' => $ja['sid'], 'x' => 1, 'z' => 5, 'h' => 10, 'pose' => 3, 'since' => $ja['since']]);
$sb = PollHub::sync(['sid' => $jb['sid'], 'x' => 2, 'z' => 5, 'h' => 20, 'pose' => 0, 'since' => $jb['since'],
    'out' => [['t' => 'chat', 'text' => 'Chúc bình an lồn'], ['t' => 'act', 'a' => 'bell'], ['t' => 'act', 'a' => 'dance']]]);
check('poll sees neighbour with pose', ($sb['players'][0][0] ?? 0) === $ja['id'] && $sb['players'][0][4] === 3);
check('poll counts', $sb['here'] === 2 && $sb['online'] >= 2);
$sa2 = PollHub::sync(['sid' => $ja['sid'], 'x' => 1, 'z' => 5, 'since' => $sa['since']]);
$types = array_map(static fn ($e) => $e['type'] . ':' . ($e['data']['text'] ?? $e['data']['a'] ?? ''), $sa2['events']);
check('poll chat masked and delivered', in_array('chat:Chúc bình an ***', $types, true));
check('poll bell delivered, unknown action dropped', in_array('act:bell', $types, true) && !in_array('act:dance', $types, true));
$sb2 = PollHub::sync(['sid' => $jb['sid'], 'x' => 2, 'z' => 5, 'since' => $sb['since'], 'out' => [['t' => 'chat', 'text' => 'again']]]);
check('poll chat flood slowed', ($sb2['errors'][0]['code'] ?? '') === 'slow');
$sb3 = PollHub::sync(['sid' => $jb['sid'], 'x' => 40, 'z' => 60, 'since' => $sb2['since']]);
PollHub::sync(['sid' => $ja['sid'], 'x' => 1, 'z' => 5, 'since' => 0, 'out' => [['t' => 'chat', 'text' => 'xa quá']]]);
$sb4 = PollHub::sync(['sid' => $jb['sid'], 'x' => 40, 'z' => 60, 'since' => $sb3['since']]);
check('poll chat stays within 30 m', !array_filter($sb4['events'], static fn ($e) => $e['type'] === 'chat'));
check('poll view radius respected', $sb4['players'] === []);
$ra = PollHub::sync(['sid' => $ja['sid'], 'x' => 0, 'z' => -14, 'since' => 0, 'out' => [['t' => 'room', 'h' => 0]]]);
$rb = PollHub::sync(['sid' => $jb['sid'], 'x' => 1, 'z' => -6, 'since' => 0]);
check('poll hall room set', $ra['room'] === 'h0#1');
check('poll courtyard does not see into the hall', $rb['players'] === []);
$rb2 = PollHub::sync(['sid' => $jb['sid'], 'x' => 1, 'z' => -14, 'since' => 0, 'out' => [['t' => 'room', 'h' => 0], ['t' => 'report', 'id' => $ja['id'], 'reason' => 'test']]]);
$rb3 = PollHub::sync(['sid' => $jb['sid'], 'x' => 1, 'z' => -14, 'since' => 0]);
check('poll same room sees each other', ($rb3['players'][0][0] ?? 0) === $ja['id']);
check('poll report stored', $rb2['reported'] === true && (int) $pdo->query("SELECT COUNT(*) FROM reports WHERE reported = 'Linh'")->fetchColumn() === 1);
check('poll unknown visitor told to rejoin', (PollHub::sync(['sid' => str_repeat('0', 32)])['code'] ?? '') === 'gone');
$pdo->prepare('UPDATE live_presence SET updated_at = updated_at - 30 WHERE sid = ?')->execute([$ja['sid']]);
check('poll stale visitor disappears', PollHub::sync(['sid' => $jb['sid'], 'x' => 1, 'z' => -14, 'since' => 0])['players'] === []);
PollHub::leave($jb['sid']);
check('poll leave removes', (PollHub::sync(['sid' => $jb['sid']])['code'] ?? '') === 'gone');
for ($i = 0; $i < 6; $i++) {
    PollHub::join(['name' => 'Same' . chr(65 + $i)], 'same-net');
}
check('poll per-network limit', (PollHub::join(['name' => 'SameG'], 'same-net')['code'] ?? '') === 'too_many');

// ---------- first-run setup ----------
use Chua\Setup;
check('setup local db only', Setup::localHost('localhost') && Setup::localHost('127.0.0.1') && !Setup::localHost('db.evil.example'));
[$vals, $errs] = Setup::fromForm(['hosting' => 'shared', 'db_host' => 'localhost', 'db_name' => 'chua_test', 'db_user' => 'chua', 'db_pass' => 'x', 'admin_pass' => 'long-enough-pw', 'admin_pass2' => 'long-enough-pw'], 'chua.example.com');
check('setup shared means polling', !$errs && $vals['realtime']['mode'] === 'poll' && $vals['redis']['enabled'] === false && $vals['base_url'] === 'https://chua.example.com');
check('setup admin hash works', password_verify('long-enough-pw', $vals['admin']['password_hash']) && strlen($vals['secret']) === 64);
[$vv] = Setup::fromForm(['hosting' => 'vps', 'redis' => '1', 'db_name' => 'd', 'db_user' => 'u', 'admin_pass' => 'long-enough-pw', 'admin_pass2' => 'long-enough-pw'], 'chua.example.com');
check('setup vps means websocket', $vv['realtime']['mode'] === 'ws' && $vv['realtime']['public_url'] === 'wss://chua.example.com/ws' && $vv['redis']['enabled'] === true);
[, $e2] = Setup::fromForm(['db_host' => 'db.evil.example', 'db_name' => 'd', 'db_user' => 'u', 'admin_pass' => 'short', 'admin_pass2' => 'other'], 'x');
check('setup refuses remote db and weak password', count($e2) === 3);
[, $e3] = Setup::fromForm(['db_name' => 'd', 'db_user' => 'u', 'admin_pass' => 'long-enough-pw', 'admin_pass2' => 'long-enough-pw', 'pay_on' => '1', 'pay_bin' => '12'], 'x');
check('setup checks bank BIN', count($e3) === 1);
$tmp = tempnam(sys_get_temp_dir(), 'cfg');
file_put_contents($tmp, Setup::renderConfig($vals));
$loaded = require $tmp;
unlink($tmp);
check('setup config file loads back', $loaded === $vals);
$conn = Setup::connect(Setup::dsn('127.0.0.1', 0, 'chua_test'), 'chua', getenv('CHUA_TEST_DB_PASS') ?: 'devpass');
check('setup connects', $conn['ok'] === true);
check('setup schema installs twice', Setup::installSchema($conn['pdo']) === ['001_schema.sql', '002_live.sql', '003_stalls.sql'] && Setup::installSchema($conn['pdo']) === ['001_schema.sql', '002_live.sql', '003_stalls.sql']);
check('setup wrong password explained', str_contains(Setup::connect(Setup::dsn('127.0.0.1', 0, 'chua_test'), 'chua', 'wrong')['error'] ?? '', 'refused'));
check('setup locked while config exists', Setup::needed() === false && Setup::writeConfig('x') === false);

// ---------- market stalls (docs/STALLS.md) ----------
use Chua\Notify;
use Chua\Stalls;
use Chua\Vendors;

foreach (['stall_rentals', 'vendor_logins', 'vendors'] as $t) {
    $pdo->exec("DELETE FROM $t");
}
Stalls::free(0);
Stalls::free(5);
$lastLink = static fn (string $kind): string => preg_match($kind === 'login' ? '/login=([a-f0-9]{64})/' : '/t=([a-f0-9]{64})/', (string) (end(Notify::$sent)[$kind === 'login' ? 3 : 1] ?? ''), $m) ? $m[1] : '';
Notify::$sent = [];
check('vendor bad email refused', Vendors::requestLink('not-an-email') === false);
check('vendor link emailed', Vendors::requestLink('An@Example.com') && (Notify::$sent[0][1] ?? '') === 'an@example.com');
$link = $lastLink('login');
$va = Vendors::login($link);
check('vendor link signs in', $va !== null);
check('vendor link works once', Vendors::login($link) === null);
Vendors::requestLink('bao@example.com');
$vb = (int) Vendors::login($lastLink('login'));
$ra = Stalls::rent($va, 0, 2);
check('rent holds the stall', ($ra['amount'] ?? 0) === 2 * Stalls::price() && str_starts_with($ra['code'] ?? '', 'SAP') && Stalls::publicList()[0]['state'] === 'held');
check('held stall refused to others', (Stalls::rent($vb, 0, 1)['error'] ?? '') === 'taken');
check('bad months refused', (Stalls::rent($va, 1, 13)['error'] ?? '') === 'months');
check('renting again reuses the request', (int) Stalls::rent($va, 0, 3)['id'] === (int) $ra['id'] && (int) Stalls::rental((int) $ra['id'])['months'] === 3);
Notify::$sent = [];
check('claim tells telegram with a link', Stalls::claim($va, (int) $ra['id']) !== null && (Notify::$sent[0][0] ?? '') === 'telegram' && ($t1 = $lastLink('decide')) !== '');
check('other vendor cannot claim', Stalls::claim($vb, (int) $ra['id']) === null);
check('not yet emails the renter', Stalls::decide($t1, false) !== null && str_contains((string) end(Notify::$sent)[2], 'chưa nhận') && Stalls::rental((int) $ra['id'])['status'] === 'pending');
check('decision link works once', Stalls::decide($t1, true) === null);
Stalls::claim($va, (int) $ra['id']);
$d = Stalls::decide($lastLink('decide'), true);
$pub = Stalls::publicList()[0];
check('approve rents the stall', $d !== null && $pub['state'] === 'rented' && !isset($pub['name']));
check('approve emails the renter', str_contains((string) end(Notify::$sent)[2], 'Đã nhận'));
$until = static fn (): int => (int) strtotime($pdo->query('SELECT paid_until FROM stalls WHERE slot = 0')->fetchColumn() . ' UTC');
check('paid for 3 months', abs($until() - strtotime('+3 months')) < 120);
check('profile refuses http link', Stalls::saveProfile($va, 0, 'Phở Bà Tư', 'http://pho.vn', []) === 'url');
check('profile refuses rude name', Stalls::saveProfile($va, 0, 'đụ quá', '', []) === 'name');
check('profile refuses 13 dishes', Stalls::saveProfile($va, 0, 'Phở Bà Tư', '', array_fill(0, 13, ['Phở', '40000'])) === 'menu');
check('other vendor cannot edit', Stalls::saveProfile($vb, 0, 'Phở', '', []) === 'stall');
check('profile saved', Stalls::saveProfile($va, 0, 'Phở Bà Tư', 'https://pho.example.vn', [['Phở bò', '45.000'], ['', '']]) === null);
$pub = Stalls::publicList()[0];
check('shop shown to visitors', ($pub['name'] ?? '') === 'Phở Bà Tư' && ($pub['menu'][0]['p'] ?? 0) === 45000 && count($pub['menu']) === 1);
$rr = Stalls::rent($va, 0, 1);
Stalls::claim($va, (int) $rr['id']);
Stalls::decide($lastLink('decide'), true);
check('renewal extends from the current end', abs($until() - strtotime('+4 months')) < 120);
$png = tempnam(sys_get_temp_dir(), 'lg');
imagepng(imagecreatetruecolor(400, 200), $png);
check('logo re-drawn at 256 px', Stalls::saveLogo($va, 0, $png) === null
    && (getimagesize(Stalls::uploadsDir() . '/logos/' . $pdo->query('SELECT logo FROM stalls WHERE slot = 0')->fetchColumn())[0] ?? 0) === 256);
file_put_contents($png, '<?php echo 1;');
check('non-image refused', Stalls::saveLogo($va, 0, $png) === 'logo');
unlink($png);
Notify::$sent = [];
Stalls::takeDown(0, 'Bán vé số');
check('taken down hides the shop and emails', Stalls::publicList()[0]['state'] === 'closed' && !isset(Stalls::publicList()[0]['name']) && str_contains((string) (Notify::$sent[0][2] ?? ''), 'gỡ'));
check('closed stall cannot be rented', (Stalls::rent($vb, 0, 1)['error'] ?? '') === 'closed');
Stalls::restore(0);
check('restore brings it back', Stalls::publicList()[0]['state'] === 'rented');
$pdo->exec('UPDATE stalls SET paid_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE slot = 0');
Notify::$sent = [];
$c1 = Stalls::cron();
$c2 = Stalls::cron();
check('reminder sent once', $c1['reminded'] === 1 && $c2['reminded'] === 0 && str_contains((string) (Notify::$sent[0][2] ?? ''), 'sắp hết hạn'));
$rb = Stalls::rent($vb, 5, 1);
$pdo->exec('UPDATE stall_rentals SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR) WHERE id = ' . (int) $rb['id']);
Stalls::cron();
check('unpaid request expires and frees the stall', Stalls::rental((int) $rb['id'])['status'] === 'expired' && Stalls::publicList()[5]['state'] === 'free');
Stalls::free(0);
check('free clears the stall', Stalls::publicList()[0]['state'] === 'free');

printf("%d passed, %d failed\n", $passed, $failed);
exit($failed ? 1 : 0);
