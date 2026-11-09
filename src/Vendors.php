<?php
declare(strict_types=1);

namespace Chua;

use PDO;

/** Stall renters sign in with a one-time link sent to their email; there are no passwords. */
final class Vendors
{
    public const LINK_MINUTES = 15;

    public static function normalize(string $email): ?string
    {
        $email = mb_strtolower(trim($email));
        return strlen($email) <= 190 && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    /** Creates the vendor if new and emails a sign-in link. False when the address is not valid. */
    public static function requestLink(string $email): bool
    {
        $email = self::normalize($email);
        if ($email === null) {
            return false;
        }
        $pdo = Db::get();
        $pdo->prepare('INSERT IGNORE INTO vendors (email, created_at) VALUES (?, ?)')->execute([$email, Db::now()]);
        $st = $pdo->prepare('SELECT id FROM vendors WHERE email = ?');
        $st->execute([$email]);
        $id = (int) $st->fetchColumn();
        $token = bin2hex(random_bytes(32));
        $pdo->prepare('INSERT INTO vendor_logins (token_hash, vendor_id, expires_at) VALUES (?, ?, ?)')
            ->execute([hash('sha256', $token), $id, gmdate('Y-m-d H:i:s', time() + self::LINK_MINUTES * 60)]);
        $link = rtrim((string) chua_config()['base_url'], '/') . '/vendor/?login=' . $token;
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        Notify::email($email, 'Đăng nhập sạp hàng An Tâm Nam Chùa',
            '<p>Bấm vào liên kết dưới đây để đăng nhập trang sạp hàng. Liên kết dùng được một lần trong '
            . self::LINK_MINUTES . ' phút.</p><p><a href="' . $e($link) . '">Đăng nhập</a></p>'
            . '<p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>');
        return true;
    }

    /** Uses up a sign-in link; returns the vendor id, or null when the link is wrong, used or old. */
    public static function login(string $token): ?int
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $pdo = Db::get();
        $st = $pdo->prepare('UPDATE vendor_logins SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?');
        $now = Db::now();
        $st->execute([$now, hash('sha256', $token), $now]);
        if ($st->rowCount() !== 1) {
            return null;
        }
        $st = $pdo->prepare('SELECT vendor_id FROM vendor_logins WHERE token_hash = ?');
        $st->execute([hash('sha256', $token)]);
        $id = (int) $st->fetchColumn();
        $pdo->prepare('UPDATE vendors SET last_login = ? WHERE id = ?')->execute([$now, $id]);
        return $id;
    }

    public static function email(int $id): ?string
    {
        $st = Db::get()->prepare('SELECT email FROM vendors WHERE id = ?');
        $st->execute([$id]);
        $v = $st->fetch(PDO::FETCH_COLUMN);
        return $v === false ? null : (string) $v;
    }
}
