<?php
declare(strict_types=1);

namespace Chua\Realtime;

use Chua\Bus;
use Chua\NameFilter;

/**
 * The realtime brain, independent of the WebSocket library. A transport calls
 * open / message / close for each connection and tick() every tick_ms.
 *
 * Text frames are JSON {"t": type, ...}. Positions travel as binary frames (see Codec).
 */
final class Hub
{
    private const ACTIONS = ['incense', 'bell', 'bow', 'kneel', 'prostrate', 'pray', 'sit', 'stand', 'sweep', 'fortune', 'wave'];
    private const LOOK_KEYS = ['outfit', 'color'];

    /** @var array<int,string> fd => ip hash, for connections that have not said hello yet */
    private array $pending = [];
    /** @var array<int,Player> fd => player */
    private array $players = [];
    /** @var array<string,Shard> */
    private array $shards = [];
    /** @var array<string,int> ip hash => open connections */
    private array $perIp = [];
    private float $lastStats = 0;
    private float $lastBeat = 0;
    private int $messages = 0;
    private int $bytesOut = 0;
    private float $startedAt;

    public function __construct(
        private readonly array $cfg,
        private readonly Transport $out,
        private readonly Services $svc,
        private readonly ?Bus $bus = null,
    ) {
        $this->startedAt = microtime(true);
    }

    public function open(int $fd, string $ipHash): void
    {
        $n = $this->perIp[$ipHash] ?? 0;
        if ($n >= (int) $this->cfg['max_per_ip']) {
            $this->error($fd, 'too_many', 'Too many open windows from your network.');
            $this->out->close($fd);
            return;
        }
        $this->perIp[$ipHash] = $n + 1;
        $this->pending[$fd] = $ipHash;
    }

    public function close(int $fd): void
    {
        $ip = $this->pending[$fd] ?? ($this->players[$fd]->ipHash ?? null);
        if ($ip !== null) {
            $this->perIp[$ip] = max(0, ($this->perIp[$ip] ?? 1) - 1);
            if ($this->perIp[$ip] === 0) {
                unset($this->perIp[$ip]);
            }
        }
        unset($this->pending[$fd]);
        $p = $this->players[$fd] ?? null;
        if ($p === null) {
            return;
        }
        unset($this->players[$fd]);
        $shard = $this->shards[$p->shard] ?? null;
        if ($shard !== null) {
            $shard->remove($p);
            $this->toShard($shard, ['t' => 'leave', 'id' => $p->id]);
            if (!$shard->players) {
                unset($this->shards[$shard->key]);
            }
        }
    }

    public function message(int $fd, string $data, bool $binary): void
    {
        $this->messages++;
        $p = $this->players[$fd] ?? null;
        if ($binary) {
            if ($p !== null && ($m = Codec::decodeMove($data)) !== null) {
                $p->x = $m['x'];
                $p->z = $m['z'];
                $p->h = $m['h'];
                $p->pose = $m['pose'];
            }
            return;
        }
        if (strlen($data) > 2048) {
            return;
        }
        $msg = json_decode($data, true);
        if (!is_array($msg) || !is_string($msg['t'] ?? null)) {
            return;
        }
        if ($p === null) {
            if ($msg['t'] === 'hello' && isset($this->pending[$fd])) {
                $this->hello($fd, $msg);
            }
            return;
        }
        match ($msg['t']) {
            'chat' => $this->chat($p, (string) ($msg['text'] ?? '')),
            'act' => $this->act($p, (string) ($msg['a'] ?? '')),
            'report' => $this->report($p, (int) ($msg['id'] ?? 0), (string) ($msg['reason'] ?? '')),
            'ping' => $this->sendJson($fd, ['t' => 'pong', 'c' => $msg['c'] ?? 0, 's' => $this->ms()]),
            default => null,
        };
    }

    public function tick(): void
    {
        $now = microtime(true);
        foreach ($this->shards as $shard) {
            $vis = $shard->visibility((int) $this->cfg['view_count'], (float) $this->cfg['view_radius']);
            foreach ($shard->players as $p) {
                $this->send($p->fd, Codec::encodeState($vis[$p->id] ?? []), true);
            }
        }
        if ($this->bus?->on()) {
            foreach ($this->bus->poll() as $ev) {
                if ($ev['type'] === 'candle') {
                    $this->toAll(['t' => 'candle', 'name' => (string) ($ev['data']['name'] ?? ''), 'size' => (string) ($ev['data']['size'] ?? 'small')]);
                } elseif ($ev['type'] === 'wish') {
                    $this->toAll(['t' => 'wish']);
                }
            }
        }
        if ($now - $this->lastBeat >= 2) {
            $this->lastBeat = $now;
            $this->bus?->heartbeat((string) $this->cfg['node_id'], (string) $this->cfg['public_url'], count($this->players), $this->shardCounts());
        }
        if ($now - $this->lastStats >= 5) {
            $this->lastStats = $now;
            $online = $this->bus?->onlineTotal() ?? count($this->players);
            $incense = $this->svc->incenseToday();
            foreach ($this->shards as $shard) {
                $this->toShard($shard, ['t' => 'stats', 'online' => max($online, count($this->players)), 'here' => count($shard->players), 'incense' => $incense]);
            }
        }
    }

    public function metrics(): string
    {
        $lines = [
            '# HELP chua_players Connected visitors on this node.',
            '# TYPE chua_players gauge',
            'chua_players ' . count($this->players),
            '# TYPE chua_pending gauge',
            'chua_pending ' . count($this->pending),
            '# TYPE chua_shards gauge',
            'chua_shards ' . count($this->shards),
            '# TYPE chua_messages_total counter',
            'chua_messages_total ' . $this->messages,
            '# TYPE chua_bytes_out_total counter',
            'chua_bytes_out_total ' . $this->bytesOut,
            '# TYPE chua_uptime_seconds gauge',
            'chua_uptime_seconds ' . round(microtime(true) - $this->startedAt),
            '# TYPE chua_memory_bytes gauge',
            'chua_memory_bytes ' . memory_get_usage(true),
        ];
        return implode("\n", $lines) . "\n";
    }

    /** @return array<string,int> */
    public function shardCounts(): array
    {
        return array_map(static fn (Shard $s) => count($s->players), $this->shards);
    }

    private function hello(int $fd, array $msg): void
    {
        $ipHash = $this->pending[$fd];
        $guest = is_string($msg['token'] ?? null) ? $this->svc->guest($msg['token']) : null;
        $name = $guest['name'] ?? NameFilter::cleanName((string) ($msg['name'] ?? ''));
        if ($name === null) {
            $this->error($fd, 'name', 'Please choose another name.');
            $this->out->close($fd);
            return;
        }
        if ($this->svc->banned($name, $ipHash)) {
            $this->error($fd, 'banned', 'This visitor cannot enter right now.');
            $this->out->close($fd);
            return;
        }
        $look = [];
        foreach (self::LOOK_KEYS as $k) {
            $v = (string) ($msg['look'][$k] ?? '');
            if ($k === 'outfit' && in_array($v, ['aotrang', 'aodai', 'baba', 'modern'], true)) {
                $look[$k] = $v;
            }
            if ($k === 'color' && preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
                $look[$k] = strtolower($v);
            }
        }
        $look += ['outfit' => 'aotrang', 'color' => '#8f918b'];
        $p = new Player($fd, $name, $look, $ipHash);
        $shard = $this->pickShard(is_string($msg['invite'] ?? null) ? $msg['invite'] : '');
        $shard->add($p);
        unset($this->pending[$fd]);
        $this->players[$fd] = $p;
        $others = [];
        foreach ($shard->players as $o) {
            if ($o !== $p) {
                $others[] = $o->profile();
            }
        }
        $this->sendJson($fd, [
            't' => 'welcome', 'id' => $p->id, 'name' => $name, 'shard' => $shard->key, 'seed' => $shard->seed,
            's' => $this->ms(), 'players' => $others, 'online' => $this->bus?->onlineTotal() ?? count($this->players),
        ]);
        $this->toShard($shard, ['t' => 'join', 'p' => $p->profile()], $p);
    }

    private function pickShard(string $invite): Shard
    {
        $size = (int) $this->cfg['shard_size'];
        if ($invite !== '' && isset($this->shards[$invite]) && count($this->shards[$invite]->players) < $size) {
            return $this->shards[$invite];
        }
        $best = null;
        foreach ($this->shards as $s) {
            $n = count($s->players);
            if ($n < $size && ($best === null || $n > count($best->players))) {
                $best = $s;
            }
        }
        if ($best !== null) {
            return $best;
        }
        do {
            $key = 's' . substr(bin2hex(random_bytes(4)), 0, 6);
        } while (isset($this->shards[$key]));
        return $this->shards[$key] = new Shard($key);
    }

    private function chat(Player $p, string $text): void
    {
        $now = microtime(true);
        $p->chatTimes = array_values(array_filter($p->chatTimes, static fn ($t) => $now - $t < 10));
        if (count($p->chatTimes) >= 5 || ($p->chatTimes && $now - end($p->chatTimes) < 1.0)) {
            $this->error($p->fd, 'slow', 'Slow down a little.');
            return;
        }
        $clean = NameFilter::maskText($text, 120);
        if ($clean === '') {
            return;
        }
        $p->chatTimes[] = $now;
        $this->svc->logChat($p->shard, $p->name, $p->ipHash, $clean);
        $this->near($p, ['t' => 'chat', 'id' => $p->id, 'text' => $clean], 30.0, true);
    }

    private function act(Player $p, string $a): void
    {
        if (!in_array($a, self::ACTIONS, true) || microtime(true) - $p->lastAct < 0.5) {
            return;
        }
        $p->lastAct = microtime(true);
        $msg = ['t' => 'act', 'id' => $p->id, 'a' => $a];
        if ($a === 'bell') {
            $this->toShard($this->shards[$p->shard], $msg, $p);
        } else {
            $this->near($p, $msg, 40.0, false);
        }
    }

    private function report(Player $p, int $id, string $reason): void
    {
        $shard = $this->shards[$p->shard] ?? null;
        $target = $shard?->players[$id] ?? null;
        if ($target === null || $target === $p || microtime(true) - $p->lastReport < 20) {
            return;
        }
        $p->lastReport = microtime(true);
        $this->svc->report($p->name, $target->name, $target->ipHash, NameFilter::maskText($reason, 200), 'shard ' . $p->shard);
        $this->sendJson($p->fd, ['t' => 'reported', 'id' => $id]);
    }

    private function near(Player $from, array $msg, float $radius, bool $includeSelf): void
    {
        $shard = $this->shards[$from->shard] ?? null;
        if ($shard === null) {
            return;
        }
        $json = $this->encode($msg);
        $r2 = $radius * $radius;
        foreach ($shard->players as $o) {
            if (($o === $from && $includeSelf) || ($o !== $from && ($o->x - $from->x) ** 2 + ($o->z - $from->z) ** 2 <= $r2)) {
                $this->send($o->fd, $json, false);
            }
        }
    }

    private function toShard(Shard $shard, array $msg, ?Player $except = null): void
    {
        $json = $this->encode($msg);
        foreach ($shard->players as $o) {
            if ($o !== $except) {
                $this->send($o->fd, $json, false);
            }
        }
    }

    private function toAll(array $msg): void
    {
        $json = $this->encode($msg);
        foreach ($this->players as $p) {
            $this->send($p->fd, $json, false);
        }
    }

    private function error(int $fd, string $code, string $text): void
    {
        $this->sendJson($fd, ['t' => 'error', 'code' => $code, 'text' => $text]);
    }

    private function sendJson(int $fd, array $msg): void
    {
        $this->send($fd, $this->encode($msg), false);
    }

    private function send(int $fd, string $data, bool $binary): void
    {
        $this->bytesOut += strlen($data);
        $this->out->send($fd, $data, $binary);
    }

    private function encode(array $msg): string
    {
        return (string) json_encode($msg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function ms(): int
    {
        return (int) floor(microtime(true) * 1000);
    }
}
