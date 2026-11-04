<?php
declare(strict_types=1);

namespace Chua\Realtime;

/** Everything the hub stores or looks up outside memory. */
interface Services
{
    /** @return array{name:string}|null the guest for a session token */
    public function guest(string $token): ?array;

    public function banned(string $name, string $ipHash): bool;

    public function logChat(string $shard, string $name, string $ipHash, string $text): void;

    public function report(string $reporter, string $reported, string $reportedIpHash, string $reason, string $context): void;

    public function incenseToday(): int;
}
