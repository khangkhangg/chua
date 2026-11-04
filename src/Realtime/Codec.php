<?php
declare(strict_types=1);

namespace Chua\Realtime;

/**
 * Binary position frames (little endian).
 * Client to server, 7 bytes: u8 type=1, i16 x*50, i16 z*50, u8 heading, u8 pose.
 * Server to client: u8 type=2, u16 count, then per visitor 8 bytes: u16 id, i16 x*50, i16 z*50, u8 heading, u8 pose.
 */
final class Codec
{
    public const SCALE = 50;
    public const POSES = 8;

    /** @return array{x:float,z:float,h:int,pose:int}|null */
    public static function decodeMove(string $data): ?array
    {
        if (strlen($data) !== 7 || ord($data[0]) !== 1) {
            return null;
        }
        $v = unpack('vx/vz/Ch/Cpose', substr($data, 1));
        $x = self::signed($v['x']) / self::SCALE;
        $z = self::signed($v['z']) / self::SCALE;
        if (abs($x) > 70 || $z > 70 || $z < -45 || $v['pose'] >= self::POSES) {
            return null;
        }
        return ['x' => $x, 'z' => $z, 'h' => $v['h'], 'pose' => $v['pose']];
    }

    public static function encodeMove(float $x, float $z, int $h, int $pose): string
    {
        return chr(1) . pack('vvCC', self::unsigned((int) round($x * self::SCALE)), self::unsigned((int) round($z * self::SCALE)), $h & 255, $pose & 255);
    }

    /** @param list<Player> $players */
    public static function encodeState(array $players): string
    {
        $out = chr(2) . pack('v', count($players));
        foreach ($players as $p) {
            $out .= pack('vvvCC', $p->id, self::unsigned((int) round($p->x * self::SCALE)), self::unsigned((int) round($p->z * self::SCALE)), $p->h, $p->pose);
        }
        return $out;
    }

    private static function signed(int $u): int
    {
        return $u >= 32768 ? $u - 65536 : $u;
    }

    private static function unsigned(int $s): int
    {
        return $s < 0 ? $s + 65536 : $s;
    }
}
