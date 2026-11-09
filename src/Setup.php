<?php
declare(strict_types=1);

namespace Chua;

use PDO;

/**
 * First-run setup: pick the kind of hosting, check the database, create the tables and write
 * config.local.php. Runs only while config.local.php does not exist.
 */
final class Setup
{
    public static function configPath(): string
    {
        return getenv('CHUA_CONFIG_LOCAL') ?: dirname(__DIR__) . '/config.local.php';
    }

    public static function needed(): bool
    {
        return !is_file(self::configPath());
    }

    /** Only a database on this same server is accepted, so a stranger cannot point a fresh install at their own database. */
    public static function localHost(string $host): bool
    {
        return in_array(strtolower(trim($host)), ['localhost', '127.0.0.1', '::1'], true) || str_starts_with($host, '/');
    }

    public static function dsn(string $host, int $port, string $name): string
    {
        if (str_starts_with($host, '/')) {
            return 'mysql:unix_socket=' . $host . ';dbname=' . $name . ';charset=utf8mb4';
        }
        return 'mysql:host=' . $host . ($port ? ';port=' . $port : '') . ';dbname=' . $name . ';charset=utf8mb4';
    }

    /** @return array{ok:bool,error?:string,pdo?:PDO} */
    public static function connect(string $dsn, string $user, string $pass): array
    {
        try {
            $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
            $v = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
            return ['ok' => true, 'pdo' => $pdo, 'version' => $v];
        } catch (\PDOException $e) {
            return ['ok' => false, 'error' => self::dbMessage($e)];
        }
    }

    /** Runs every sql/*.sql file in order. MEMORY tables fall back to InnoDB where the host refuses them. */
    public static function installSchema(PDO $pdo): array
    {
        $done = [];
        foreach (glob(dirname(__DIR__) . '/sql/*.sql') ?: [] as $file) {
            $sql = (string) file_get_contents($file);
            $sql = (string) preg_replace('/^--.*$/m', '', $sql);
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                try {
                    $pdo->exec($stmt);
                } catch (\PDOException $e) {
                    if (str_contains($stmt, 'ENGINE=MEMORY')) {
                        $pdo->exec(str_replace('ENGINE=MEMORY', 'ENGINE=InnoDB', $stmt));
                    } else {
                        throw $e;
                    }
                }
            }
            $done[] = basename($file);
        }
        return $done;
    }

    /** @param array<string,mixed> $values */
    public static function renderConfig(array $values): string
    {
        return "<?php\n// Written by the setup page on " . gmdate('Y-m-d H:i') . " UTC. Edit by hand to change settings.\n"
            . "// To run the setup page again, delete this file.\nreturn " . var_export($values, true) . ";\n";
    }

    public static function writeConfig(string $php): bool
    {
        $path = self::configPath();
        if (is_file($path) || !is_writable(dirname($path))) {
            return false;
        }
        if (file_put_contents($path, $php, LOCK_EX) === false) {
            return false;
        }
        @chmod($path, 0640);
        return true;
    }

    /**
     * Turns the form into config values. Returns [values, errors].
     * @return array{0:array<string,mixed>,1:list<string>}
     */
    public static function fromForm(array $f, string $siteHost): array
    {
        $err = [];
        $hosting = ($f['hosting'] ?? '') === 'vps' ? 'vps' : 'shared';
        $dbHost = trim((string) ($f['db_host'] ?? 'localhost')) ?: 'localhost';
        $dbPort = (int) ($f['db_port'] ?? 0);
        $dbName = trim((string) ($f['db_name'] ?? ''));
        $dbUser = trim((string) ($f['db_user'] ?? ''));
        $dbPass = (string) ($f['db_pass'] ?? '');
        $admin = (string) ($f['admin_pass'] ?? '');
        $name = trim((string) ($f['temple_name'] ?? '')) ?: 'An Tâm Nam Chùa';
        if (!self::localHost($dbHost)) {
            $err[] = 'The database must be on this server (localhost). For a remote database, write config.local.php by hand.';
        }
        if ($dbName === '' || $dbUser === '') {
            $err[] = 'Enter the database name and user.';
        }
        if (mb_strlen($admin) < 10) {
            $err[] = 'Choose an admin password of at least 10 characters.';
        }
        if ($admin !== (string) ($f['admin_pass2'] ?? '')) {
            $err[] = 'The two admin passwords do not match.';
        }
        $host = preg_replace('/[^a-z0-9.\-:]/i', '', $siteHost) ?: 'localhost';
        $wsUrl = trim((string) ($f['ws_url'] ?? '')) ?: 'wss://' . $host . '/ws';
        if ($hosting === 'vps' && !preg_match('#^wss?://[^\s]+$#', $wsUrl)) {
            $err[] = 'The live server address must start with wss:// (or ws:// for testing).';
        }
        $values = [
            'temple_name' => mb_substr($name, 0, 60),
            'base_url' => 'https://' . $host,
            'secret' => bin2hex(random_bytes(32)),
            'trust_cloudflare' => !empty($f['cloudflare']),
            'db' => ['dsn' => self::dsn($dbHost, $dbPort, $dbName), 'user' => $dbUser, 'pass' => $dbPass],
            'redis' => ['enabled' => $hosting === 'vps' && !empty($f['redis'])],
            'realtime' => $hosting === 'vps'
                ? ['enabled' => true, 'mode' => 'ws', 'public_url' => $wsUrl]
                : ['enabled' => true, 'mode' => 'poll', 'poll_ms' => 1000],
            'payments' => ['enabled' => false, 'test_mode' => false],
            'admin' => ['password_hash' => password_hash($admin, PASSWORD_DEFAULT)],
        ];
        if (!empty($f['pay_on'])) {
            $bin = preg_replace('/\D/', '', (string) ($f['pay_bin'] ?? ''));
            $acct = preg_replace('/[^0-9A-Za-z]/', '', (string) ($f['pay_account'] ?? ''));
            if (strlen((string) $bin) !== 6 || $acct === '') {
                $err[] = 'For candle payments, enter the 6-digit bank BIN and the account number, or leave payments off for now.';
            }
            $values['payments'] = [
                'enabled' => true, 'test_mode' => false,
                'provider' => ($f['pay_provider'] ?? '') === 'payos' ? 'payos' : 'sepay',
                'bank_bin' => $bin, 'account_no' => $acct,
                'account_name' => strtoupper(trim((string) ($f['pay_name'] ?? ''))),
                'bank_label' => trim((string) ($f['pay_label'] ?? '')),
                'sepay_api_key' => trim((string) ($f['pay_sepay_key'] ?? '')),
                'payos_checksum_key' => trim((string) ($f['pay_payos_key'] ?? '')),
            ];
        }
        return [$values, $err];
    }

    private static function dbMessage(\PDOException $e): string
    {
        $m = $e->getMessage();
        return match (true) {
            str_contains($m, '1045') => 'The database refused the user or password.',
            str_contains($m, '1049') => 'That database does not exist. Create it first in your hosting panel.',
            str_contains($m, '2002'), str_contains($m, '2005') => 'No database answered at that address. On most hosts the address is localhost.',
            default => 'The database said: ' . mb_substr($m, 0, 160),
        };
    }
}
