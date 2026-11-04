<?php
declare(strict_types=1);

/**
 * Realtime server. Run: php realtime/server.php
 * Uses OpenSwoole when the extension is installed (thousands of visitors per node),
 * otherwise plain PHP streams (about 1,000). Force the plain one with --stream.
 * Options: --port=9502 --node=node1 --url=wss://chua.vietnamcos.com/ws (the address browsers use for this node)
 */

require dirname(__DIR__) . '/src/bootstrap.php';

use Chua\Bus;
use Chua\Http;
use Chua\Realtime\DbServices;
use Chua\Realtime\Hub;
use Chua\Realtime\StreamServer;

$opts = getopt('', ['port:', 'node:', 'stream', 'host:', 'url:']);
$cfg = chua_config()['realtime'];
if (isset($opts['port'])) {
    $cfg['port'] = (int) $opts['port'];
}
if (isset($opts['node'])) {
    $cfg['node_id'] = (string) $opts['node'];
}
if (isset($opts['url'])) {
    $cfg['public_url'] = (string) $opts['url'];
}
if (isset($opts['host'])) {
    $cfg['host'] = (string) $opts['host'];
}
$hasher = static fn (string $ip): string => Http::ipHash($ip);
$useSwoole = !isset($opts['stream']) && class_exists('OpenSwoole\\WebSocket\\Server');

if (!$useSwoole) {
    $server = new StreamServer($cfg['host'], (int) $cfg['port'], $hasher);
    $hub = new Hub($cfg, $server, new DbServices(), Bus::fromConfig());
    $server->attach($hub);
    if (function_exists('pcntl_signal')) {
        pcntl_async_signals(true);
        pcntl_signal(SIGTERM, static fn () => $server->stop());
        pcntl_signal(SIGINT, static fn () => $server->stop());
    }
    fwrite(STDERR, sprintf("[chua] %s listening on %s:%d (plain PHP streams)\n", $cfg['node_id'], $cfg['host'], $cfg['port']));
    $server->run((int) $cfg['tick_ms']);
    exit(0);
}

// OpenSwoole: one worker keeps all of this node's shards in one process.
$ws = new OpenSwoole\WebSocket\Server($cfg['host'], (int) $cfg['port']);
$ws->set([
    'worker_num' => 1,
    'max_connection' => 20000,
    'heartbeat_check_interval' => 30,
    'heartbeat_idle_time' => 90,
    'package_max_length' => 65536,
    'enable_coroutine' => false,
]);
$transport = new class($ws) implements Chua\Realtime\Transport {
    public function __construct(private OpenSwoole\WebSocket\Server $ws)
    {
    }

    public function send(int $fd, string $data, bool $binary): void
    {
        if ($this->ws->isEstablished($fd)) {
            $this->ws->push($fd, $data, $binary ? 2 : 1);
        }
    }

    public function close(int $fd): void
    {
        if ($this->ws->exist($fd)) {
            $this->ws->disconnect($fd);
        }
    }
};
$hub = null;
$ws->on('WorkerStart', static function ($server) use (&$hub, $cfg, $transport): void {
    $hub = new Hub($cfg, $transport, new DbServices(), Bus::fromConfig());
    $server->tick((int) $cfg['tick_ms'], static function () use (&$hub): void {
        $hub->tick();
    });
});
$ws->on('Open', static function ($server, $request) use (&$hub, $hasher): void {
    $h = $request->header ?? [];
    $ip = $request->server['remote_addr'] ?? '0.0.0.0';
    if (in_array($ip, ['127.0.0.1', '::1'], true)) {
        $ip = $h['cf-connecting-ip'] ?? $h['x-real-ip'] ?? $ip;
    }
    $hub->open($request->fd, $hasher($ip));
});
$ws->on('Message', static function ($server, $frame) use (&$hub): void {
    $hub->message($frame->fd, (string) $frame->data, $frame->opcode === 2);
});
$ws->on('Close', static function ($server, int $fd) use (&$hub): void {
    $hub?->close($fd);
});
$ws->on('Request', static function ($request, $response) use (&$hub): void {
    if (($request->server['request_uri'] ?? '') === '/metrics') {
        $response->header('Content-Type', 'text/plain; version=0.0.4');
        $response->end($hub?->metrics() ?? '');
        return;
    }
    $response->status(404);
    $response->end();
});
fwrite(STDERR, sprintf("[chua] %s listening on %s:%d (OpenSwoole)\n", $cfg['node_id'], $cfg['host'], $cfg['port']));
$ws->start();
