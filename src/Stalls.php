<?php
declare(strict_types=1);

namespace Chua;

use PDO;

/**
 * Rentable stalls in the street market (docs/STALLS.md). A stall is rented while paid_until is in
 * the future; a request holds it for a short time while the vendor pays by bank transfer, and the
 * owner approves the transfer from a one-time link sent to Telegram.
 */
final class Stalls
{
    public const COUNT = 12;
    public const MENU_MAX = 12;
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function price(): int
    {
        return (int) (chua_config()['stalls']['price_month'] ?? 50000);
    }

    private static function cfg(string $key, int $default): int
    {
        return (int) (chua_config()['stalls'][$key] ?? $default);
    }

    public static function label(int $slot): string
    {
        return 'Sạp số ' . ($slot + 1);
    }

    private static function at(int $seconds): string
    {
        return gmdate('Y-m-d H:i:s', time() + $seconds);
    }

    /** @return array<string,mixed> */
    private static function row(int $slot, bool $lock = false): array
    {
        $st = Db::get()->prepare('SELECT * FROM stalls WHERE slot = ?' . ($lock ? ' FOR UPDATE' : ''));
        $st->execute([$slot]);
        return $st->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    /** rented | held | closed | free, from a stalls row. */
    public static function state(array $r, ?string $now = null): string
    {
        $now ??= Db::now();
        if ($r['taken_down_at'] !== null) {
            return 'closed';
        }
        if ($r['vendor_id'] !== null && $r['paid_until'] !== null && $r['paid_until'] > $now) {
            return 'rented';
        }
        return $r['held_until'] !== null && $r['held_until'] > $now ? 'held' : 'free';
    }

    public static function logoUrl(?string $file): ?string
    {
        return $file ? '/uploads/logos/' . rawurlencode($file) : null;
    }

    /** What every visitor sees: shop details only for stalls that are rented and not taken down. */
    public static function publicList(): array
    {
        $now = Db::now();
        $out = [];
        foreach (Db::get()->query('SELECT * FROM stalls ORDER BY slot')->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $s = ['slot' => (int) $r['slot'], 'state' => self::state($r, $now)];
            if ($s['state'] === 'rented' && $r['shop_name'] !== null) {
                $s += ['name' => $r['shop_name'], 'logo' => self::logoUrl($r['logo']), 'url' => $r['url'],
                    'menu' => json_decode((string) $r['menu'], true) ?: []];
            }
            $out[] = $s;
        }
        return $out;
    }

    private static function newCode(): string
    {
        $code = 'SAP';
        for ($i = 0; $i < 6; $i++) {
            $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }
        return $code;
    }

    /**
     * Starts (or updates) a rental request and holds the stall for this vendor; renewing your own
     * rented stall needs no hold. Returns the rental row, or ['error' => slot|months|taken|closed].
     */
    public static function rent(int $vendorId, int $slot, int $months): array
    {
        if ($slot < 0 || $slot >= self::COUNT) {
            return ['error' => 'slot'];
        }
        if ($months < 1 || $months > 12) {
            return ['error' => 'months'];
        }
        $pdo = Db::get();
        $pdo->beginTransaction();
        try {
            $s = self::row($slot, true);
            $now = Db::now();
            $state = self::state($s, $now);
            $mine = (int) $s['vendor_id'] === $vendorId && $state === 'rented';
            if ($state === 'closed') {
                $pdo->rollBack();
                return ['error' => 'closed'];
            }
            if (($state === 'rented' && !$mine) || ($state === 'held' && (int) $s['held_by'] !== $vendorId)) {
                $pdo->rollBack();
                return ['error' => 'taken'];
            }
            if (!$mine) {
                $pdo->prepare('UPDATE stalls SET held_by = ?, held_until = ? WHERE slot = ?')
                    ->execute([$vendorId, self::at(self::cfg('hold_minutes', 30) * 60), $slot]);
            }
            $amount = $months * self::price();
            $st = $pdo->prepare("SELECT * FROM stall_rentals WHERE vendor_id = ? AND slot = ? AND status IN ('pending','claimed') ORDER BY id DESC LIMIT 1 FOR UPDATE");
            $st->execute([$vendorId, $slot]);
            $open = $st->fetch(PDO::FETCH_ASSOC);
            if ($open && $open['status'] === 'pending') {
                $pdo->prepare('UPDATE stall_rentals SET months = ?, amount = ?, created_at = ? WHERE id = ?')
                    ->execute([$months, $amount, $now, $open['id']]);
                $id = (int) $open['id'];
            } elseif ($open) {
                $id = (int) $open['id'];   // already claimed: wait for the owner, do not change the amount
            } else {
                for ($try = 0; ; $try++) {
                    try {
                        $pdo->prepare('INSERT INTO stall_rentals (code, vendor_id, slot, months, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                            ->execute([self::newCode(), $vendorId, $slot, $months, $amount, $now]);
                        break;
                    } catch (\PDOException $e) {
                        if ($e->getCode() !== '23000' || $try >= 4) {
                            throw $e;
                        }
                    }
                }
                $id = (int) $pdo->lastInsertId();
            }
            $pdo->commit();
            return self::rental($id);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** @return array<string,mixed> */
    public static function rental(int $id): array
    {
        $st = Db::get()->prepare('SELECT r.*, v.email FROM stall_rentals r JOIN vendors v ON v.id = r.vendor_id WHERE r.id = ?');
        $st->execute([$id]);
        return $st->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    /** The vendor says they transferred: keep the hold and send the owner a one-time decision link. */
    public static function claim(int $vendorId, int $rentalId): ?array
    {
        $token = bin2hex(random_bytes(32));
        $pdo = Db::get();
        $st = $pdo->prepare("UPDATE stall_rentals SET status = 'claimed', claimed_at = ?, decide_token = ? WHERE id = ? AND vendor_id = ? AND status IN ('pending','claimed')");
        $st->execute([Db::now(), $token, $rentalId, $vendorId]);
        if ($st->rowCount() !== 1) {
            return null;
        }
        $r = self::rental($rentalId);
        $pdo->prepare('UPDATE stalls SET held_until = GREATEST(COALESCE(held_until, ?), ?) WHERE slot = ? AND held_by = ?')
            ->execute([Db::now(), self::at(7 * 86400), $r['slot'], $vendorId]);
        $e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $link = rtrim((string) chua_config()['base_url'], '/') . '/admin/decide.php?t=' . $token;
        Notify::telegram('<b>Thuê sạp: báo đã chuyển khoản</b>' . "\n"
            . $e(self::label((int) $r['slot'])) . ' · ' . (int) $r['months'] . ' tháng · '
            . number_format((int) $r['amount'], 0, ',', '.') . " đ\n"
            . 'Nội dung: <code>' . $e($r['code']) . "</code>\n" . 'Email: ' . $e($r['email']) . "\n"
            . '<a href="' . $e($link) . '">Mở để duyệt</a>');
        return $r;
    }

    /** Looks up a claimed request by its decision link; null when the link was used or never existed. */
    public static function byToken(string $token): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $st = Db::get()->prepare("SELECT id FROM stall_rentals WHERE decide_token = ? AND status = 'claimed'");
        $st->execute([$token]);
        $id = $st->fetchColumn();
        return $id === false ? null : self::rental((int) $id);
    }

    /**
     * Approve: the stall is the vendor's until now (or the current end) plus the paid months.
     * Not yet: the request goes back to waiting and the vendor is told the money has not arrived.
     */
    public static function decide(string $token, bool $approve): ?array
    {
        $r = self::byToken($token);
        if ($r === null) {
            return null;
        }
        $pdo = Db::get();
        $pdo->beginTransaction();
        try {
            $st = $pdo->prepare("UPDATE stall_rentals SET status = ?, decided_at = ?, decide_token = NULL WHERE id = ? AND decide_token = ? AND status = 'claimed'");
            $st->execute([$approve ? 'approved' : 'pending', Db::now(), $r['id'], $token]);
            if ($st->rowCount() !== 1) {
                $pdo->rollBack();
                return null;
            }
            if (!$approve) {
                // A fresh waiting window, so the vendor has time to transfer again before the cron expires it.
                $pdo->prepare('UPDATE stall_rentals SET created_at = ? WHERE id = ?')->execute([Db::now(), $r['id']]);
            } else {
                $s = self::row((int) $r['slot'], true);
                $now = Db::now();
                $same = (int) $s['vendor_id'] === (int) $r['vendor_id'];
                if (!$same) {
                    // A new renter starts with an empty shop.
                    $pdo->prepare('UPDATE stalls SET shop_name = NULL, logo = NULL, url = NULL, menu = NULL, taken_down_at = NULL, takedown_reason = NULL WHERE slot = ?')
                        ->execute([$r['slot']]);
                }
                $from = $same && $s['paid_until'] !== null && $s['paid_until'] > $now ? $s['paid_until'] : $now;
                $pdo->prepare('UPDATE stalls SET vendor_id = ?, paid_until = DATE_ADD(?, INTERVAL ? MONTH), held_by = NULL, held_until = NULL, reminded_at = NULL, updated_at = ? WHERE slot = ?')
                    ->execute([$r['vendor_id'], $from, (int) $r['months'], $now, $r['slot']]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        $link = rtrim((string) chua_config()['base_url'], '/') . '/vendor/';
        $label = self::label((int) $r['slot']);
        if ($approve) {
            Notify::email($r['email'], "Đã nhận tiền thuê $label",
                "<p>Chùa đã nhận khoản chuyển <b>{$r['code']}</b>. $label là của bạn thêm {$r['months']} tháng.</p>"
                . "<p>Vào <a href=\"$link\">trang sạp hàng</a> để đặt tên, logo và thực đơn.</p>");
        } else {
            Notify::email($r['email'], "Chùa chưa nhận được tiền thuê $label",
                "<p>Chùa chưa thấy khoản chuyển với nội dung <b>{$r['code']}</b>. Bạn kiểm tra lại số tiền và nội dung chuyển khoản,"
                . " rồi bấm \"Tôi đã chuyển khoản\" lần nữa trên <a href=\"$link\">trang sạp hàng</a>.</p>");
        }
        return self::rental((int) $r['id']);
    }

    /** Stalls this vendor rents or rented, and their open requests. */
    public static function forVendor(int $vendorId): array
    {
        $st = Db::get()->prepare('SELECT * FROM stalls WHERE vendor_id = ? ORDER BY slot');
        $st->execute([$vendorId]);
        $stalls = $st->fetchAll(PDO::FETCH_ASSOC);
        $st = Db::get()->prepare("SELECT * FROM stall_rentals WHERE vendor_id = ? ORDER BY id DESC LIMIT 30");
        $st->execute([$vendorId]);
        return ['stalls' => $stalls, 'rentals' => $st->fetchAll(PDO::FETCH_ASSOC)];
    }

    private static function ownedActive(int $vendorId, int $slot): bool
    {
        $s = self::row($slot);
        return $s && (int) $s['vendor_id'] === $vendorId && self::state($s) === 'rented';
    }

    /**
     * Saves the shop name, website and menu; returns an error code (name|url|menu|stall) or null.
     * @param list<array{0:string,1:string}> $menu name and price pairs as typed
     */
    public static function saveProfile(int $vendorId, int $slot, string $name, string $url, array $menu): ?string
    {
        if (!self::ownedActive($vendorId, $slot)) {
            return 'stall';
        }
        $name = trim(preg_replace('/\s+/u', ' ', $name));
        if (mb_strlen($name) < 2 || mb_strlen($name) > 60 || NameFilter::isOffensive($name)) {
            return 'name';
        }
        $url = trim($url);
        if ($url !== '' && (strlen($url) > 200 || !filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https')) {
            return 'url';
        }
        $items = [];
        foreach ($menu as [$n, $p]) {
            $n = trim(preg_replace('/\s+/u', ' ', (string) $n));
            $p = trim((string) $p);
            if ($n === '' && $p === '') {
                continue;
            }
            $price = (int) preg_replace('/\D/', '', $p);
            if ($n === '' || mb_strlen($n) > 60 || NameFilter::isOffensive($n) || $price < 0 || $price > 100000000) {
                return 'menu';
            }
            $items[] = ['n' => $n, 'p' => $price];
        }
        if (count($items) > self::MENU_MAX) {
            return 'menu';
        }
        Db::get()->prepare('UPDATE stalls SET shop_name = ?, url = ?, menu = ?, updated_at = ? WHERE slot = ?')
            ->execute([$name, $url === '' ? null : $url, json_encode($items, JSON_UNESCAPED_UNICODE), Db::now(), $slot]);
        return null;
    }

    public static function uploadsDir(): string
    {
        return rtrim((string) (chua_config()['uploads_dir'] ?? '/var/www/chua-uploads'), '/');
    }

    /** Re-draws the uploaded image as a 256 px PNG, so nothing but pixels survives. Error code or null. */
    public static function saveLogo(int $vendorId, int $slot, string $tmp): ?string
    {
        if (!self::ownedActive($vendorId, $slot)) {
            return 'stall';
        }
        if (!is_file($tmp) || filesize($tmp) > 2 * 1024 * 1024 || !($info = @getimagesize($tmp))
            || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)
            || $info[0] * $info[1] > 40000000 || !($src = @imagecreatefromstring((string) file_get_contents($tmp)))) {
            return 'logo';
        }
        [$w, $h] = [imagesx($src), imagesy($src)];
        $k = 256 / max($w, $h);
        $dw = max(1, (int) round($w * $k));
        $dh = max(1, (int) round($h * $k));
        $dst = imagecreatetruecolor(256, 256);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagecopyresampled($dst, $src, (int) ((256 - $dw) / 2), (int) ((256 - $dh) / 2), 0, 0, $dw, $dh, $w, $h);
        $dir = self::uploadsDir() . '/logos';
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            return 'logo';
        }
        $file = 's' . $slot . '-' . bin2hex(random_bytes(6)) . '.png';
        if (!imagepng($dst, "$dir/$file", 8)) {
            return 'logo';
        }
        $old = self::row($slot)['logo'] ?? null;
        Db::get()->prepare('UPDATE stalls SET logo = ?, updated_at = ? WHERE slot = ?')->execute([$file, Db::now(), $slot]);
        if ($old && preg_match('/^s\d+-[a-f0-9]{12}\.png$/', $old)) {
            @unlink("$dir/$old");
        }
        return null;
    }

    public static function takeDown(int $slot, string $reason): void
    {
        $r = self::row($slot);
        Db::get()->prepare('UPDATE stalls SET taken_down_at = ?, takedown_reason = ? WHERE slot = ?')
            ->execute([Db::now(), mb_substr(trim($reason), 0, 200), $slot]);
        if ($r && $r['vendor_id'] !== null && ($email = Vendors::email((int) $r['vendor_id']))) {
            Notify::email($email, self::label($slot) . ' đã bị tạm gỡ',
                '<p>Sạp của bạn đã bị gỡ khỏi chợ vì vi phạm quy định sạp hàng: '
                . htmlspecialchars(trim($reason), ENT_QUOTES, 'UTF-8') . '</p><p>Xem quy định tại '
                . htmlspecialchars(rtrim((string) chua_config()['base_url'], '/') . '/vendor/policy.php', ENT_QUOTES, 'UTF-8') . '</p>');
        }
    }

    public static function restore(int $slot): void
    {
        Db::get()->prepare('UPDATE stalls SET taken_down_at = NULL, takedown_reason = NULL WHERE slot = ?')->execute([$slot]);
    }

    /** Ends the rental and clears the shop, so anyone can rent the stall again. */
    public static function free(int $slot): void
    {
        Db::get()->prepare('UPDATE stalls SET vendor_id = NULL, paid_until = NULL, held_by = NULL, held_until = NULL, shop_name = NULL, logo = NULL, url = NULL, menu = NULL, taken_down_at = NULL, takedown_reason = NULL, reminded_at = NULL, updated_at = ? WHERE slot = ?')
            ->execute([Db::now(), $slot]);
    }

    /** Hourly: expire unpaid requests and holds, and remind renters a few days before the end. */
    public static function cron(): array
    {
        $pdo = Db::get();
        $now = Db::now();
        $hold = self::cfg('hold_minutes', 30) * 60;
        $st = $pdo->prepare("UPDATE stall_rentals SET status = 'expired' WHERE status = 'pending' AND created_at < ?");
        $st->execute([gmdate('Y-m-d H:i:s', time() - $hold)]);
        $expired = $st->rowCount();
        $st = $pdo->prepare("UPDATE stalls s SET held_by = NULL, held_until = NULL WHERE held_until IS NOT NULL AND (held_until < ? OR NOT EXISTS (SELECT 1 FROM stall_rentals r WHERE r.slot = s.slot AND r.vendor_id = s.held_by AND r.status IN ('pending','claimed')))");
        $st->execute([$now]);
        $released = $st->rowCount();
        $st = $pdo->prepare('SELECT s.slot, s.paid_until, v.email FROM stalls s JOIN vendors v ON v.id = s.vendor_id WHERE s.paid_until > ? AND s.paid_until <= ? AND s.reminded_at IS NULL AND s.taken_down_at IS NULL');
        $st->execute([$now, self::at(self::cfg('remind_days', 3) * 86400)]);
        $reminded = 0;
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $label = self::label((int) $r['slot']);
            $link = rtrim((string) chua_config()['base_url'], '/') . '/vendor/';
            Notify::email($r['email'], "$label sắp hết hạn",
                "<p>$label hết hạn thuê lúc {$r['paid_until']} (giờ UTC). Gia hạn trên <a href=\"$link\">trang sạp hàng</a> để giữ sạp.</p>");
            $pdo->prepare('UPDATE stalls SET reminded_at = ? WHERE slot = ?')->execute([$now, $r['slot']]);
            $reminded++;
        }
        return ['expired' => $expired, 'released' => $released, 'reminded' => $reminded];
    }
}
