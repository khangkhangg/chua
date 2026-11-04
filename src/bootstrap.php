<?php
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'Chua\\', 5) !== 0) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 5)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

function chua_config(): array
{
    static $config = null;
    return $config ??= require dirname(__DIR__) . '/config.php';
}
