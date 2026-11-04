<?php
declare(strict_types=1);

namespace Chua;

/**
 * Optional Redis link: node heartbeats, the shard directory, global counters and
 * a small event stream (candles lit, wishes) that every realtime node reads.
 * Every method is a quiet no-op when Redis is off or unreachable.
 */
final class Bus
{
    private ?\Redis $r = null;
    private string $p;
    private string $lastId = '$';

    public function __construct(array $cfg)
    {
        $this->p = $cfg['prefix'] ?? 'chua:';
        if (!($cfg['enabled'] ?? false) || !class_exists(\Redis::class)) {
            return;
        }
        try {
            $r = new \Redis();
            if ($r->connect($cfg['host'], (int) $cfg['port'], 1.0)) {
                $this->r = $r;
            }
        } catch (\Throwable) {
            $this->r = null;
        }
    }

    public static function fromConfig(): self
    {
        return new self(chua_config()['redis']);
    }

    public function on(): bool
    {
        return $this->r !== null;
    }

    public function publish(string $type, array $data): void
    {
        $this->try(fn () => $this->r->xAdd($this->p . 'events', '*', ['type' => $type, 'data' => json_encode($data, JSON_UNESCAPED_UNICODE)], 1000, true));
    }

    /** @return list<array{type:string,data:array}> events since the last call */
    public function poll(): array
    {
        $rows = $this->try(fn () => $this->r->xRead([$this->p . 'events' => $this->lastId], 50)) ?: [];
        $out = [];
        foreach ($rows[$this->p . 'events'] ?? [] as $id => $f) {
            $this->lastId = (string) $id;
            $out[] = ['type' => (string) ($f['type'] ?? ''), 'data' => json_decode((string) ($f['data'] ?? '[]'), true) ?: []];
        }
        return $out;
    }

    /** Heartbeat for one realtime node, plus which node holds each shard. */
    public function heartbeat(string $node, string $url, int $count, array $shards): void
    {
        $this->try(function () use ($node, $url, $count, $shards): void {
            $this->r->hSet($this->p . 'nodes', $node, json_encode(['url' => $url, 'count' => $count, 'ts' => time()]));
            foreach ($shards as $key => $n) {
                $this->r->setex($this->p . 'shard:' . $key, 30, $node);
            }
        });
    }

    /** @return array<string,array{url:string,count:int,ts:int}> nodes seen in the last 15 s */
    public function nodes(): array
    {
        $all = $this->try(fn () => $this->r->hGetAll($this->p . 'nodes')) ?: [];
        $out = [];
        foreach ($all as $id => $json) {
            $n = json_decode((string) $json, true);
            if (is_array($n) && time() - (int) $n['ts'] < 15) {
                $out[(string) $id] = $n;
            }
        }
        return $out;
    }

    public function shardNode(string $shard): ?string
    {
        $v = $this->try(fn () => $this->r->get($this->p . 'shard:' . $shard));
        return is_string($v) ? $v : null;
    }

    public function onlineTotal(): ?int
    {
        if (!$this->on()) {
            return null;
        }
        return array_sum(array_map(static fn ($n) => (int) $n['count'], $this->nodes()));
    }

    private function try(callable $fn): mixed
    {
        if ($this->r === null) {
            return null;
        }
        try {
            return $fn();
        } catch (\Throwable) {
            return null;
        }
    }
}
