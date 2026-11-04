<?php
declare(strict_types=1);

/**
 * Local load test with real WebSocket clients, no extra tools needed.
 *   php tests/load/bots.php --url=ws://127.0.0.1:9502 --bots=200 --seconds=20
 * Each bot says hello, walks a random loop at 10 updates per second, chats now and
 * then, and counts what it receives. Prints a summary at the end.
 */
$o = getopt('', ['url:', 'bots:', 'seconds:']);
$url = parse_url($o['url'] ?? 'ws://127.0.0.1:9502');
$host = $url['host'] ?? '127.0.0.1';
$port = (int) ($url['port'] ?? 80);
$path = $url['path'] ?? '/';
$n = (int) ($o['bots'] ?? 100);
$secs = (int) ($o['seconds'] ?? 15);

$bots = [];
$t0 = microtime(true);
for ($i = 0; $i < $n; $i++) {
    $s = @stream_socket_client("tcp://$host:$port", $errno, $err, 5);
    if ($s === false) {
        fwrite(STDERR, "connect failed at bot $i: $err\n");
        break;
    }
    $key = base64_encode(random_bytes(16));
    fwrite($s, "GET $path HTTP/1.1\r\nHost: $host\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\nX-Real-IP: 10.0." . intdiv($i, 250) . '.' . ($i % 250) . "\r\n\r\n");
    $resp = '';
    while (!str_contains($resp, "\r\n\r\n")) {
        $c = fread($s, 1024);
        if ($c === '' || $c === false) {
            break;
        }
        $resp .= $c;
    }
    if (!str_contains($resp, ' 101 ')) {
        fwrite(STDERR, "handshake failed at bot $i\n");
        break;
    }
    stream_set_blocking($s, false);
    $bots[$i] = ['s' => $s, 'buf' => substr($resp, strpos($resp, "\r\n\r\n") + 4), 'a' => $i * 0.37, 'r' => 3 + ($i % 20), 'states' => 0, 'seen' => 0, 'chat' => 0, 'welcome' => false];
    send($s, json_encode(['t' => 'hello', 'name' => 'Bot ' . $i, 'look' => ['outfit' => 'modern', 'color' => '#3d6aa0']]), false);
}
printf("%d bots connected in %.1fs\n", count($bots), microtime(true) - $t0);

$end = microtime(true) + $secs;
$nextMove = microtime(true);
while (microtime(true) < $end) {
    if (microtime(true) >= $nextMove) {
        $nextMove += 0.1;
        foreach ($bots as $i => &$b) {
            $b['a'] += 0.05;
            $x = cos($b['a']) * $b['r'];
            $z = 5 + sin($b['a']) * $b['r'];
            send($b['s'], chr(1) . pack('vvCC', u16((int) round($x * 50)), u16((int) round($z * 50)), 0, 0), true);
            if (mt_rand(0, 300) === 0) {
                send($b['s'], json_encode(['t' => 'chat', 'text' => 'A Di Đà Phật']), false);
            }
        }
        unset($b);
    }
    $read = array_map(static fn ($b) => $b['s'], $bots);
    $w = $e = null;
    if ($read && @stream_select($read, $w, $e, 0, 20000)) {
        foreach ($read as $s) {
            $i = array_search($s, array_column($bots, 's'), true);
            $id = array_keys($bots)[$i];
            $bots[$id]['buf'] .= (string) fread($s, 262144);
            while (($f = frame($bots[$id]['buf'])) !== null) {
                [$op, $data] = $f;
                if ($op === 2 && ord($data[0]) === 2) {
                    $bots[$id]['states']++;
                    $bots[$id]['seen'] = max($bots[$id]['seen'], unpack('v', substr($data, 1, 2))[1]);
                } elseif ($op === 1) {
                    $j = json_decode($data, true);
                    if (($j['t'] ?? '') === 'welcome') {
                        $bots[$id]['welcome'] = true;
                    } elseif (($j['t'] ?? '') === 'chat') {
                        $bots[$id]['chat']++;
                    }
                }
            }
        }
    }
}
$states = array_column($bots, 'states');
printf("welcomed %d/%d, state frames per bot: min %d avg %.0f (expected about %d), max visible %d, chat messages seen %d\n",
    count(array_filter(array_column($bots, 'welcome'))), count($bots), min($states ?: [0]), $states ? array_sum($states) / count($states) : 0,
    $secs * 10, max(array_column($bots, 'seen') ?: [0]), array_sum(array_column($bots, 'chat')));

function u16(int $v): int { return $v < 0 ? $v + 65536 : $v; }
function send($s, string $data, bool $bin): void
{
    $len = strlen($data);
    $head = chr(0x80 | ($bin ? 2 : 1));
    $head .= $len < 126 ? chr(0x80 | $len) : chr(0x80 | 126) . pack('n', $len);
    $mask = random_bytes(4);
    @fwrite($s, $head . $mask . ($data ^ substr(str_repeat($mask, intdiv($len, 4) + 1), 0, $len)));
}
function frame(string &$buf): ?array
{
    if (strlen($buf) < 2) {
        return null;
    }
    $op = ord($buf[0]) & 15;
    $len = ord($buf[1]) & 127;
    $pos = 2;
    if ($len === 126) {
        if (strlen($buf) < 4) {
            return null;
        }
        $len = unpack('n', substr($buf, 2, 2))[1];
        $pos = 4;
    } elseif ($len === 127) {
        if (strlen($buf) < 10) {
            return null;
        }
        $len = unpack('J', substr($buf, 2, 8))[1];
        $pos = 10;
    }
    if (strlen($buf) < $pos + $len) {
        return null;
    }
    $data = substr($buf, $pos, $len);
    $buf = substr($buf, $pos + $len);
    return [$op, $data];
}
