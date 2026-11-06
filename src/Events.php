<?php
declare(strict_types=1);

namespace Chua;

/** Site-wide notices (a candle lit, a wish hung) for every live visitor, in either live mode. */
final class Events
{
    public static function publish(string $type, array $data): void
    {
        Bus::fromConfig()->publish($type, $data);
        $rt = chua_config()['realtime'];
        if ($rt['enabled'] && ($rt['mode'] ?? 'ws') === 'poll') {
            try {
                Db::get()->prepare("INSERT INTO live_events (shard, type, data, created_at) VALUES ('', ?, ?, ?)")
                    ->execute([$type, json_encode($data, JSON_UNESCAPED_UNICODE), microtime(true)]);
            } catch (\Throwable) {
                // a missing table must never block a payment
            }
        }
    }
}
