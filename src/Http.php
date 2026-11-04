<?php
declare(strict_types=1);

namespace Chua;

final class Http
{
    public static function json(array $data, int $code = 200): never
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** @return array<string,mixed> */
    public static function input(int $maxBytes = 8192): array
    {
        $raw = (string) file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        if (strlen($raw) > $maxBytes) {
            self::json(['error' => 'too_large'], 413);
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function requireMethod(string $method): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            header('Allow: ' . $method);
            self::json(['error' => 'method'], 405);
        }
    }

    public static function ip(): string
    {
        $remote = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        if (chua_config()['trust_cloudflare'] && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            return (string) $_SERVER['HTTP_CF_CONNECTING_IP'];
        }
        if (in_array($remote, ['127.0.0.1', '::1'], true) && !empty($_SERVER['HTTP_X_REAL_IP'])) {
            return (string) $_SERVER['HTTP_X_REAL_IP'];
        }
        return $remote;
    }

    public static function ipHash(?string $ip = null): string
    {
        return hash_hmac('sha256', $ip ?? self::ip(), chua_config()['secret']);
    }

    /** True while the caller is under $max hits per $window seconds for this key. */
    public static function allow(string $key, int $max, int $window): bool
    {
        $now = time();
        $pdo = Db::get();
        $pdo->prepare('INSERT INTO rate_limits (k, n, reset_at) VALUES (?, 1, ?)
            ON DUPLICATE KEY UPDATE n = IF(reset_at < ?, 1, n + 1), reset_at = IF(reset_at < ?, ?, reset_at)')
            ->execute([$key, $now + $window, $now, $now, $now + $window]);
        $st = $pdo->prepare('SELECT n FROM rate_limits WHERE k = ?');
        $st->execute([$key]);
        return (int) $st->fetchColumn() <= $max;
    }

    public static function guestByToken(string $token): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $st = Db::get()->prepare('SELECT id, name FROM guests WHERE token = ?');
        $st->execute([$token]);
        $row = $st->fetch();
        return $row ?: null;
    }

    public static function isBanned(string $name, string $ipHash): bool
    {
        $st = Db::get()->prepare("SELECT 1 FROM bans WHERE (kind = 'name' AND value = ?) OR (kind = 'ip' AND value = ?) LIMIT 1");
        $st->execute([mb_strtolower($name), $ipHash]);
        return (bool) $st->fetchColumn();
    }
}
