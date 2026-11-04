<?php
declare(strict_types=1);

namespace Chua;

use PDO;

final class Db
{
    private static ?PDO $pdo = null;

    public static function get(): PDO
    {
        if (self::$pdo === null) {
            $c = chua_config()['db'];
            self::$pdo = new PDO($c['dsn'], $c['user'], $c['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }
        return self::$pdo;
    }

    /** For long-running processes: drop the connection so the next get() reconnects. */
    public static function reset(): void
    {
        self::$pdo = null;
    }

    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }
}
