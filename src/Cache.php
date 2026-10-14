<?php

declare(strict_types=1);

namespace Pokedex;

/**
 * Cache simples em disco (JSON) com tempo de expiração.
 */
final class Cache
{
    public function __construct(
        private readonly string $dir,
        private readonly int $ttl = 604800 // 7 dias
    ) {
        if (!is_dir($this->dir)) {
            mkdir($this->dir, 0775, true);
        }
    }

    public function get(string $key): mixed
    {
        $file = $this->path($key);

        if (!is_file($file) || filemtime($file) + $this->ttl < time()) {
            return null;
        }

        $raw = file_get_contents($file);

        return $raw === false ? null : json_decode($raw, true);
    }

    public function set(string $key, mixed $value): void
    {
        file_put_contents(
            $this->path($key),
            json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            LOCK_EX
        );
    }

    /**
     * Retorna o valor em cache ou executa o callback e armazena o resultado.
     */
    public function remember(string $key, callable $callback): mixed
    {
        $value = $this->get($key);

        if ($value !== null) {
            return $value;
        }

        $value = $callback();
        $this->set($key, $value);

        return $value;
    }

    private function path(string $key): string
    {
        return $this->dir . DIRECTORY_SEPARATOR . sha1($key) . '.json';
    }
}
