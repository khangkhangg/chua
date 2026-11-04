<?php
declare(strict_types=1);

namespace Chua\Payment;

/**
 * Napas VietQR payload (EMVCo merchant-presented QR) for a bank transfer with a
 * fixed amount and memo. Any Vietnamese banking app can scan it.
 */
final class VietQR
{
    public static function payload(string $bin, string $account, int $amount, string $memo): string
    {
        $merchant = self::tlv('00', 'A000000727')
            . self::tlv('01', self::tlv('00', $bin) . self::tlv('01', $account))
            . self::tlv('02', 'QRIBFTTA');
        $body = self::tlv('00', '01')
            . self::tlv('01', '12')
            . self::tlv('38', $merchant)
            . self::tlv('53', '704')
            . self::tlv('54', (string) $amount)
            . self::tlv('58', 'VN')
            . self::tlv('62', self::tlv('08', $memo))
            . '6304';
        return $body . self::crc16($body);
    }

    /** Hosted image of the same QR, used as a fallback if the page cannot draw it. */
    public static function imageUrl(string $bin, string $account, int $amount, string $memo, string $name): string
    {
        return sprintf('https://img.vietqr.io/image/%s-%s-compact2.png?amount=%d&addInfo=%s&accountName=%s',
            rawurlencode($bin), rawurlencode($account), $amount, rawurlencode($memo), rawurlencode($name));
    }

    private static function tlv(string $id, string $value): string
    {
        return $id . str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT) . $value;
    }

    /** CRC-16/CCITT-FALSE, upper-case hex. */
    public static function crc16(string $s): string
    {
        $crc = 0xFFFF;
        $len = strlen($s);
        for ($i = 0; $i < $len; $i++) {
            $crc ^= ord($s[$i]) << 8;
            for ($b = 0; $b < 8; $b++) {
                $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) : ($crc << 1);
                $crc &= 0xFFFF;
            }
        }
        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }
}
