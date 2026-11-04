<?php
declare(strict_types=1);

namespace Chua\Payment;

/** Turns a provider's webhook into one call to Orders::applyPayment, after checking it is genuine. */
final class Webhooks
{
    /** SePay sends "Authorization: Apikey <key>" with the key set in its dashboard. */
    public static function sepay(array $body, string $authHeader, string $key): ?array
    {
        if ($key === '' || !hash_equals('Apikey ' . $key, trim($authHeader))) {
            return null;
        }
        if (($body['transferType'] ?? '') !== 'in' || !isset($body['id'])) {
            return ['skip' => true];
        }
        return [
            'txn' => 'sepay:' . $body['id'],
            'amount' => (int) ($body['transferAmount'] ?? 0),
            'content' => trim(($body['content'] ?? '') . ' ' . ($body['code'] ?? '') . ' ' . ($body['description'] ?? '')),
        ];
    }

    /** PayOS signs data with HMAC-SHA256 over key=value pairs sorted by key. */
    public static function payos(array $body, string $checksumKey): ?array
    {
        $data = $body['data'] ?? null;
        $sig = (string) ($body['signature'] ?? '');
        if ($checksumKey === '' || !is_array($data) || !hash_equals(self::payosSignature($data, $checksumKey), $sig)) {
            return null;
        }
        if (($data['code'] ?? '') !== '00') {
            return ['skip' => true];
        }
        return [
            'txn' => 'payos:' . ($data['reference'] ?? $data['orderCode'] ?? ''),
            'amount' => (int) ($data['amount'] ?? 0),
            'content' => (string) ($data['description'] ?? ''),
        ];
    }

    public static function payosSignature(array $data, string $key): string
    {
        ksort($data);
        $parts = [];
        foreach ($data as $k => $v) {
            if ($v === null || $v === 'null' || $v === 'undefined') {
                $v = '';
            } elseif (is_array($v)) {
                $v = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            } elseif (is_bool($v)) {
                $v = $v ? 'true' : 'false';
            }
            $parts[] = $k . '=' . $v;
        }
        return hash_hmac('sha256', implode('&', $parts), $key);
    }
}
