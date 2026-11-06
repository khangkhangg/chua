<?php
declare(strict_types=1);

namespace Chua\Payment;

use Chua\Bus;
use Chua\Db;
use PDO;

final class Orders
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function newCode(): string
    {
        $code = 'NEN';
        for ($i = 0; $i < 6; $i++) {
            $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }
        return $code;
    }

    /** Finds an order code inside a bank transfer memo, however the bank mangled it. */
    public static function findCode(string $content): ?string
    {
        $flat = strtoupper((string) preg_replace('/[^A-Za-z0-9]/', '', $content));
        return preg_match('/NEN[A-HJ-NP-Z2-9]{6}/', $flat, $m) ? $m[0] : null;
    }

    public static function create(string $name, string $wish, string $size, string $ipHash): array
    {
        $cfg = chua_config()['payments'];
        $amount = (int) $cfg['sizes'][$size];
        $pdo = Db::get();
        for ($try = 0; $try < 5; $try++) {
            $code = self::newCode();
            try {
                $pdo->prepare('INSERT INTO candle_orders (code, name, wish, size, amount, status, ip_hash, created_at) VALUES (?,?,?,?,?,\'pending\',?,?)')
                    ->execute([$code, $name, $wish, $size, $amount, $ipHash, Db::now()]);
                return ['code' => $code, 'amount' => $amount];
            } catch (\PDOException $e) {
                if ($e->getCode() !== '23000') {
                    throw $e;
                }
            }
        }
        throw new \RuntimeException('Could not create a unique order code');
    }

    public static function status(string $code): ?string
    {
        self::expireOld();
        $st = Db::get()->prepare('SELECT status FROM candle_orders WHERE code = ?');
        $st->execute([$code]);
        $s = $st->fetchColumn();
        return $s === false ? null : (string) $s;
    }

    public static function expireOld(): void
    {
        $min = (int) chua_config()['payments']['order_minutes'];
        Db::get()->prepare("UPDATE candle_orders SET status = 'expired' WHERE status = 'pending' AND created_at < ?")
            ->execute([gmdate('Y-m-d H:i:s', time() - $min * 60)]);
    }

    /**
     * Records one incoming transfer exactly once and lights the candle it pays for.
     * Returns: duplicate | unmatched | short | paid | already
     */
    public static function applyPayment(string $provider, string $txnId, int $amount, string $content, string $raw): string
    {
        $pdo = Db::get();
        $pdo->beginTransaction();
        try {
            try {
                $pdo->prepare('INSERT INTO payments (provider, txn_id, amount, content, raw, created_at) VALUES (?,?,?,?,?,?)')
                    ->execute([$provider, $txnId, $amount, mb_substr($content, 0, 255), $raw, Db::now()]);
            } catch (\PDOException $e) {
                if ($e->getCode() === '23000') {
                    $pdo->rollBack();
                    return 'duplicate';
                }
                throw $e;
            }
            $paymentId = (int) $pdo->lastInsertId();
            $code = self::findCode($content);
            $order = null;
            if ($code !== null) {
                $st = $pdo->prepare('SELECT * FROM candle_orders WHERE code = ? FOR UPDATE');
                $st->execute([$code]);
                $order = $st->fetch(PDO::FETCH_ASSOC) ?: null;
            }
            if ($order === null) {
                $pdo->commit();
                return 'unmatched';
            }
            $pdo->prepare('UPDATE payments SET order_id = ? WHERE id = ?')->execute([$order['id'], $paymentId]);
            if ($order['status'] === 'paid') {
                $pdo->commit();
                return 'already';
            }
            if ($amount < (int) $order['amount']) {
                $pdo->commit();
                return 'short';
            }
            $hours = (int) chua_config()['payments']['candle_hours'];
            $now = Db::now();
            $pdo->prepare("UPDATE candle_orders SET status = 'paid', paid_at = ? WHERE id = ?")->execute([$now, $order['id']]);
            $pdo->prepare('INSERT INTO candles (order_id, name, wish, size, lit_at, expires_at) VALUES (?,?,?,?,?,?)')
                ->execute([$order['id'], $order['name'], $order['wish'], $order['size'], $now, gmdate('Y-m-d H:i:s', time() + $hours * 3600)]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
        \Chua\Events::publish('candle', ['name' => $order['name'], 'size' => $order['size']]);
        return 'paid';
    }

    /** @return list<array<string,mixed>> */
    public static function activeCandles(int $limit = 60): array
    {
        $st = Db::get()->prepare('SELECT name, wish, size, lit_at FROM candles WHERE expires_at > ? ORDER BY lit_at DESC LIMIT ' . max(1, min(200, $limit)));
        $st->execute([Db::now()]);
        return $st->fetchAll();
    }
}
