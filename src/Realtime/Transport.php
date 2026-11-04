<?php
declare(strict_types=1);

namespace Chua\Realtime;

/** What the hub needs from a WebSocket server: OpenSwoole in production, plain PHP streams otherwise. */
interface Transport
{
    public function send(int $fd, string $data, bool $binary): void;

    public function close(int $fd): void;
}
