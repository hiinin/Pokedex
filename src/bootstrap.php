<?php

declare(strict_types=1);

/**
 * Bootstrap da aplicação: autoloader PSR-4 simples para o namespace Pokedex\
 * e constantes de configuração.
 */

define('POKEDEX_ROOT', dirname(__DIR__));
define('POKEDEX_CACHE_DIR', POKEDEX_ROOT . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'cache');

spl_autoload_register(static function (string $class): void {
    $prefix = 'Pokedex\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = str_replace('\\', DIRECTORY_SEPARATOR, substr($class, strlen($prefix)));
    $file = __DIR__ . DIRECTORY_SEPARATOR . $relative . '.php';

    if (is_file($file)) {
        require $file;
    }
});
