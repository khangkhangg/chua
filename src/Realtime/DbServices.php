<?php
declare(strict_types=1);

namespace Chua\Realtime;

use Chua\Db;
use Chua\Http;

final class DbServices implements Services
{
    private int $incense = 0;
    private float $incenseAt = 0;

    public function guest(string $token): ?array
    {
        return $this->safe(fn () => Http::guestByToken($token));
    }

    public function banned(string $name, string $ipHash): bool
    {
        return (bool) $this->safe(fn () => Http::isBanned($name, $ipHash));
    }

    public function logChat(string $shard, string $name, string $ipHash, string $text): void
    {
        $this->safe(fn () => Db::get()->prepare('INSERT INTO chat_log (shard, name, ip_hash, text, created_at) VALUES (?,?,?,?,?)')
            ->execute([$shard, $name, $ipHash, $text, Db::now()]));
    }

    public function report(string $reporter, string $reported, string $reportedIpHash, string $reason, string $context): void
    {
        $this->safe(fn () => Db::get()->prepare('INSERT INTO reports (reporter, reported, reported_ip_hash, reason, context, created_at) VALUES (?,?,?,?,?,?)')
            ->execute([$reporter, $reported, $reportedIpHash, $reason, $context, Db::now()]));
    }

    public function incenseToday(): int
    {
        if (microtime(true) - $this->incenseAt > 10) {
            $this->incenseAt = microtime(true);
            $this->incense = (int) $this->safe(function () {
                $st = Db::get()->prepare("SELECT count FROM events_daily WHERE day = ? AND type = 'incense'");
                $st->execute([gmdate('Y-m-d')]);
                return $st->fetchColumn();
            });
        }
        return $this->incense;
    }

    /** A lost database connection must never take the realtime server down. */
    private function safe(callable $fn): mixed
    {
        try {
            return $fn();
        } catch (\PDOException) {
            Db::reset();
            try {
                return $fn();
            } catch (\Throwable) {
                return null;
            }
        } catch (\Throwable) {
            return null;
        }
    }
}
