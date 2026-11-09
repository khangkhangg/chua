<?php
declare(strict_types=1);

namespace Chua\Realtime;

use Chua\Db;
use Chua\Http;
use Chua\NameFilter;
use PDO;

/**
 * Live visitors without a realtime server, for shared hosting. Each page checks in through
 * api/live.php about once a second with its position and any chat or action, and gets back the
 * nearest visitors in its courtyard and room, the notices since its last check-in and the counts.
 * Same rules as Hub: courtyards of shard_size, rooms of room_size, nearest view_count within view_radius.
 */
final class PollHub
{
    public const FRESH = 8.0;   // seconds without a check-in before a visitor counts as gone
    private const ACTIONS = ['incense', 'bell', 'bow', 'kneel', 'prostrate', 'pray', 'sit', 'stand', 'sweep', 'fortune', 'wave'];

    public static function seedFor(string $shard): int
    {
        return (int) (crc32($shard) % 1000000);
    }

    public static function join(array $in, string $ipHash): array
    {
        $cfg = chua_config()['realtime'];
        $pdo = Db::get();
        self::cleanup(0.1);
        $guest = is_string($in['token'] ?? null) ? Http::guestByToken($in['token']) : null;
        $name = $guest['name'] ?? NameFilter::cleanName((string) ($in['name'] ?? ''));
        if ($name === null) {
            return ['t' => 'error', 'code' => 'name', 'text' => 'Please choose another name.'];
        }
        if (Http::isBanned($name, $ipHash)) {
            return ['t' => 'error', 'code' => 'banned', 'text' => 'This visitor cannot enter right now.'];
        }
        $now = microtime(true);
        $st = $pdo->prepare('SELECT COUNT(*) FROM live_presence WHERE ip_hash = ? AND updated_at > ?');
        $st->execute([$ipHash, $now - self::FRESH]);
        if ((int) $st->fetchColumn() >= (int) $cfg['max_per_ip']) {
            return ['t' => 'error', 'code' => 'too_many', 'text' => 'Too many open windows from your network.'];
        }
        $look = self::look($in['look'] ?? []);
        $shard = self::pickShard((string) ($in['invite'] ?? ''), (int) $cfg['shard_size'], $now);
        $sid = bin2hex(random_bytes(16));
        $pdo->prepare('INSERT INTO live_presence (sid, shard, room, name, look, ip_hash, x, z, h, pose, updated_at) VALUES (?,?,\'\',?,?,?,0,30,128,0,?)')
            ->execute([$sid, $shard, $name, json_encode($look), $ipHash, $now]);
        $id = (int) $pdo->lastInsertId();
        $me = ['id' => $id, 'shard' => $shard, 'room' => '', 'x' => 0.0, 'z' => 30.0];
        return [
            't' => 'welcome', 'id' => $id, 'sid' => $sid, 'name' => $name, 'shard' => $shard, 'seed' => self::seedFor($shard),
            's' => (int) floor($now * 1000), 'players' => array_map([self::class, 'profile'], self::nearby($me, $now)),
            'online' => self::online($now), 'since' => (int) $pdo->query('SELECT COALESCE(MAX(id), 0) FROM live_events')->fetchColumn(),
            'poll' => (int) $cfg['poll_ms'],
        ];
    }

    public static function sync(array $in): array
    {
        $pdo = Db::get();
        $now = microtime(true);
        self::cleanup(0.02);
        $sid = (string) ($in['sid'] ?? '');
        $st = $pdo->prepare('SELECT * FROM live_presence WHERE sid = ?');
        $st->execute([preg_match('/^[a-f0-9]{32}$/', $sid) ? $sid : '']);
        $me = $st->fetch(PDO::FETCH_ASSOC);
        if (!$me) {
            return ['t' => 'error', 'code' => 'gone'];
        }
        $x = (float) ($in['x'] ?? $me['x']);
        $z = (float) ($in['z'] ?? $me['z']);
        if (abs($x) > 70 || $z > 70 || $z < -45) {
            $x = (float) $me['x'];
            $z = (float) $me['z'];
        }
        $h = max(0, min(255, (int) ($in['h'] ?? $me['h'])));
        $pose = max(0, min(Codec::POSES - 1, (int) ($in['pose'] ?? $me['pose'])));
        $me = ['id' => (int) $me['id'], 'sid' => $sid, 'shard' => $me['shard'], 'room' => $me['room'], 'name' => $me['name'], 'ip_hash' => $me['ip_hash'], 'x' => $x, 'z' => $z];
        $errors = [];
        $reported = false;
        foreach (array_slice(is_array($in['out'] ?? null) ? $in['out'] : [], 0, 5) as $msg) {
            if (!is_array($msg)) {
                continue;
            }
            switch ($msg['t'] ?? '') {
                case 'room':
                    $me['room'] = self::room($me, (int) ($msg['h'] ?? -1), $now);
                    break;
                case 'chat':
                    if (!Http::allow('pchat:' . $sid, 5, 10) || !Http::allow('pchat1:' . $sid, 1, 1)) {
                        $errors[] = ['code' => 'slow', 'text' => 'Slow down a little.'];
                        break;
                    }
                    $text = NameFilter::maskText((string) ($msg['text'] ?? ''), 120);
                    if ($text !== '') {
                        self::event($me, 'chat', ['text' => $text], 30.0, $now);
                        $pdo->prepare('INSERT INTO chat_log (shard, name, ip_hash, text, created_at) VALUES (?,?,?,?,?)')
                            ->execute([$me['shard'], $me['name'], $me['ip_hash'], $text, Db::now()]);
                    }
                    break;
                case 'act':
                    $a = (string) ($msg['a'] ?? '');
                    if (in_array($a, self::ACTIONS, true) && Http::allow('pact:' . $sid, 2, 1)) {
                        self::event($me, 'act', ['a' => $a], $a === 'bell' ? null : 40.0, $now);
                    }
                    break;
                case 'report':
                    $target = self::byId((int) ($msg['id'] ?? 0));
                    if ($target && $target['shard'] === $me['shard'] && (int) $target['id'] !== $me['id'] && Http::allow('preport:' . $sid, 1, 20)) {
                        $pdo->prepare('INSERT INTO reports (reporter, reported, reported_ip_hash, reason, context, created_at) VALUES (?,?,?,?,?,?)')
                            ->execute([$me['name'], $target['name'], $target['ip_hash'], NameFilter::maskText((string) ($msg['reason'] ?? ''), 200), 'shard ' . $me['shard'], Db::now()]);
                        $reported = true;
                    }
                    break;
            }
        }
        $pdo->prepare('UPDATE live_presence SET x = ?, z = ?, h = ?, pose = ?, room = ?, updated_at = ? WHERE id = ?')
            ->execute([$x, $z, $h, $pose, $me['room'], $now, $me['id']]);

        $since = max(0, (int) ($in['since'] ?? 0));
        $st = $pdo->prepare("SELECT id, shard, room, type, actor, x, z, radius, data FROM live_events WHERE id > ? AND (shard = ? OR shard = '') ORDER BY id LIMIT 100");
        $st->execute([$since, $me['shard']]);
        $events = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $e) {
            $since = max($since, (int) $e['id']);
            if ($e['shard'] !== '' && ($e['room'] ?? '') !== $me['room']) {
                continue;
            }
            if ($e['radius'] !== null && (int) $e['actor'] !== $me['id'] && (($e['x'] - $x) ** 2 + ($e['z'] - $z) ** 2) > $e['radius'] ** 2) {
                continue;
            }
            $events[] = ['type' => $e['type'], 'actor' => $e['actor'] === null ? null : (int) $e['actor'], 'data' => json_decode($e['data'], true) ?: []];
        }
        $st = $pdo->prepare('SELECT COUNT(*) AS online, COALESCE(SUM(shard = ?), 0) AS here FROM live_presence WHERE updated_at > ?');
        $st->execute([$me['shard'], $now - self::FRESH]);
        $counts = $st->fetch(PDO::FETCH_ASSOC);
        $here = (int) $counts['here'];
        $st = $pdo->prepare("SELECT count FROM events_daily WHERE day = ? AND type = 'incense'");
        $st->execute([gmdate('Y-m-d')]);
        $players = array_map(static fn (array $p) => [(int) $p['id'], round((float) $p['x'], 2), round((float) $p['z'], 2), (int) $p['h'], (int) $p['pose'], $p['name'], json_decode($p['look'], true) ?: []], self::nearby($me, $now));
        return [
            't' => 'sync', 's' => (int) floor($now * 1000), 'players' => $players, 'events' => $events, 'since' => $since,
            'online' => (int) $counts['online'], 'here' => $here, 'incense' => (int) $st->fetchColumn(), 'room' => $me['room'],
            'errors' => $errors, 'reported' => $reported,
        ];
    }

    public static function leave(string $sid): void
    {
        Db::get()->prepare('DELETE FROM live_presence WHERE sid = ?')->execute([$sid]);
    }

    public static function online(float $now): int
    {
        $st = Db::get()->prepare('SELECT COUNT(*) FROM live_presence WHERE updated_at > ?');
        $st->execute([$now - self::FRESH]);
        return (int) $st->fetchColumn();
    }

    /** Nearest visitors in the same courtyard and room, nearest first. */
    private static function nearby(array $me, float $now): array
    {
        $cfg = chua_config()['realtime'];
        $r2 = ((float) $cfg['view_radius']) ** 2;
        $st = Db::get()->prepare('SELECT id, name, look, x, z, h, pose, ((x - ?) * (x - ?) + (z - ?) * (z - ?)) AS d2 FROM live_presence
            WHERE shard = ? AND room = ? AND id <> ? AND updated_at > ? HAVING d2 <= ? ORDER BY d2 LIMIT ' . max(1, (int) $cfg['view_count']));
        $st->execute([$me['x'], $me['x'], $me['z'], $me['z'], $me['shard'], $me['room'], $me['id'], $now - self::FRESH, $r2]);
        return $st->fetchAll(PDO::FETCH_ASSOC);
    }

    private static function profile(array $p): array
    {
        return ['id' => (int) $p['id'], 'name' => $p['name'], 'look' => json_decode($p['look'], true) ?: [], 'x' => round((float) $p['x'], 2), 'z' => round((float) $p['z'], 2), 'h' => (int) $p['h'], 'pose' => (int) $p['pose']];
    }

    private static function byId(int $id): ?array
    {
        $st = Db::get()->prepare('SELECT id, shard, name, ip_hash FROM live_presence WHERE id = ?');
        $st->execute([$id]);
        return $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private static function pickShard(string $invite, int $size, float $now): string
    {
        $st = Db::get()->prepare('SELECT shard, COUNT(*) n FROM live_presence WHERE updated_at > ? GROUP BY shard');
        $st->execute([$now - self::FRESH]);
        $counts = array_column($st->fetchAll(PDO::FETCH_ASSOC), 'n', 'shard');
        if (preg_match('/^s[a-f0-9]{6}$/', $invite) && (int) ($counts[$invite] ?? 0) < $size) {
            return $invite;
        }
        $best = null;
        foreach ($counts as $shard => $n) {
            if ((int) $n < $size && ($best === null || (int) $n > (int) $counts[$best])) {
                $best = (string) $shard;
            }
        }
        return $best ?? 's' . substr(bin2hex(random_bytes(4)), 0, 6);
    }

    /** Same rule as Shard::enterRoom: the first room of the hall with space, or the courtyard. */
    private static function room(array $me, int $hall, float $now): string
    {
        if ($hall < 0 || $hall > 31) {
            return '';
        }
        if (str_starts_with($me['room'], 'h' . $hall . '#')) {
            return $me['room'];
        }
        $size = (int) (chua_config()['realtime']['room_size'] ?? 30);
        $st = Db::get()->prepare("SELECT room, COUNT(*) n FROM live_presence WHERE shard = ? AND room LIKE ? AND id <> ? AND updated_at > ? GROUP BY room");
        $st->execute([$me['shard'], 'h' . $hall . '#%', $me['id'], $now - self::FRESH]);
        $counts = array_column($st->fetchAll(PDO::FETCH_ASSOC), 'n', 'room');
        for ($n = 1; ; $n++) {
            $room = 'h' . $hall . '#' . $n;
            if ((int) ($counts[$room] ?? 0) < $size) {
                return $room;
            }
        }
    }

    private static function event(array $me, string $type, array $data, ?float $radius, float $now): void
    {
        Db::get()->prepare('INSERT INTO live_events (shard, room, type, actor, x, z, radius, data, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$me['shard'], $me['room'], $type, $me['id'], $me['x'], $me['z'], $radius, json_encode($data, JSON_UNESCAPED_UNICODE), $now]);
    }

    /** @return array{outfit:string,color:string} */
    private static function look(mixed $raw): array
    {
        $look = ['outfit' => 'aotrang', 'color' => '#8f918b'];
        if (is_array($raw)) {
            if (in_array($raw['outfit'] ?? '', ['aotrang', 'aodai', 'baba', 'modern'], true)) {
                $look['outfit'] = $raw['outfit'];
            }
            if (preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($raw['color'] ?? ''))) {
                $look['color'] = strtolower($raw['color']);
            }
        }
        return $look;
    }

    /** Old rows are cleared by a small share of requests, so no cron job is needed. */
    private static function cleanup(float $chance): void
    {
        if (mt_rand() / mt_getrandmax() >= $chance) {
            return;
        }
        $now = microtime(true);
        $pdo = Db::get();
        $pdo->prepare('DELETE FROM live_presence WHERE updated_at < ?')->execute([$now - 60]);
        $pdo->prepare('DELETE FROM live_events WHERE created_at < ?')->execute([$now - 120]);
        $pdo->prepare('DELETE FROM rate_limits WHERE reset_at < ?')->execute([time() - 60]);
    }
}
