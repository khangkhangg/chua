<?php
declare(strict_types=1);

/**
 * Load test for polling mode (shared hosting). Each bot joins, then checks in once a second
 * with a new position, now and then a chat line, like a real page does.
 *   php tests/load/poll_bots.php --url=https://chua.vietnamcos.com --bots=50 --seconds=30
 * Prints requests per second and response times. Run it from your own computer, not the host.
 */
$o = getopt('', ['url:', 'bots:', 'seconds:']);
$base = rtrim($o['url'] ?? 'http://127.0.0.1:8900', '/') . '/api/live.php';
$n = (int) ($o['bots'] ?? 50);
$secs = (int) ($o['seconds'] ?? 20);

function post(string $url, array $body): CurlHandle
{
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body), CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_TIMEOUT => 10]);
    return $c;
}

$bots = [];
for ($i = 0; $i < $n; $i++) {
    $c = post($base, ['a' => 'join', 'name' => 'Poll ' . $i, 'look' => ['outfit' => 'modern', 'color' => '#3d6aa0']]);
    curl_setopt($c, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'X-Real-IP: 10.9.' . intdiv($i, 200) . '.' . ($i % 200)]);
    $j = json_decode((string) curl_exec($c), true);
    if (($j['t'] ?? '') !== 'welcome') {
        fwrite(STDERR, "join failed at bot $i: " . json_encode($j) . "\n");
        break;
    }
    $bots[] = ['sid' => $j['sid'], 'since' => $j['since'], 'a' => $i * 0.37, 'r' => 3 + $i % 20, 'next' => microtime(true) + mt_rand(0, 1000) / 1000];
}
printf("%d bots joined\n", count($bots));

$mh = curl_multi_init();
$times = [];
$inflight = [];
$seen = 0;
$end = microtime(true) + $secs;
while (microtime(true) < $end) {
    $now = microtime(true);
    foreach ($bots as $i => &$b) {
        if ($now >= $b['next'] && !isset($inflight[$i])) {
            $b['next'] += 1.0;
            $b['a'] += 0.1;
            $out = mt_rand(0, 60) === 0 ? [['t' => 'chat', 'text' => 'A Di Đà Phật']] : [];
            $c = post($base, ['a' => 'sync', 'sid' => $b['sid'], 'since' => $b['since'], 'x' => cos($b['a']) * $b['r'], 'z' => 5 + sin($b['a']) * $b['r'], 'h' => 0, 'pose' => 0, 'out' => $out]);
            curl_multi_add_handle($mh, $c);
            $inflight[$i] = [$c, microtime(true)];
        }
    }
    unset($b);
    curl_multi_exec($mh, $running);
    curl_multi_select($mh, 0.01);
    while ($info = curl_multi_info_read($mh)) {
        foreach ($inflight as $i => [$c, $t0]) {
            if ($c === $info['handle']) {
                $times[] = microtime(true) - $t0;
                $j = json_decode((string) curl_multi_getcontent($c), true);
                if (isset($j['since'])) {
                    $bots[$i]['since'] = $j['since'];
                    $seen = max($seen, count($j['players']));
                }
                curl_multi_remove_handle($mh, $c);
                unset($inflight[$i]);
            }
        }
    }
}
sort($times);
$cnt = count($times);
printf("%d check-ins in %ds = %.0f per second; response ms: median %.0f, p95 %.0f, max %.0f; most visitors seen by one bot: %d\n",
    $cnt, $secs, $cnt / $secs, 1000 * $times[intdiv($cnt, 2)], 1000 * $times[(int) floor($cnt * 0.95)], 1000 * end($times), $seen);
