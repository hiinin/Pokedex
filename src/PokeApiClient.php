<?php

declare(strict_types=1);

namespace Pokedex;

/**
 * Cliente HTTP da PokeAPI com suporte a requisições paralelas (curl_multi).
 */
final class PokeApiClient
{
    private const BASE_URL = 'https://pokeapi.co/api/v2/';
    private const TIMEOUT = 20;

    public function get(string $path): array
    {
        return $this->getMany([$path])[$path];
    }

    /**
     * Busca vários recursos em paralelo.
     *
     * @param string[] $paths Caminhos relativos (ex.: "pokemon/25") ou URLs completas.
     * @return array<string, array> Respostas indexadas pelo caminho solicitado.
     */
    public function getMany(array $paths): array
    {
        $paths = array_values(array_unique($paths));
        if ($paths === []) {
            return [];
        }

        $multi = curl_multi_init();
        $handles = [];

        foreach ($paths as $path) {
            $handle = curl_init($this->url($path));
            curl_setopt_array($handle, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => self::TIMEOUT,
                CURLOPT_ENCODING => '',
                CURLOPT_USERAGENT => 'Pokedex-PHP-Vue/1.0',
                CURLOPT_SSL_VERIFYPEER => getenv('POKEDEX_INSECURE_SSL') !== '1',
            ]);
            // Usa o repositório de certificados do SO (resolve erro de CA no Windows).
            if (defined('CURLSSLOPT_NATIVE_CA')) {
                curl_setopt($handle, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
            }
            curl_multi_add_handle($multi, $handle);
            $handles[$path] = $handle;
        }

        do {
            $status = curl_multi_exec($multi, $running);
            if ($running) {
                curl_multi_select($multi);
            }
        } while ($running && $status === CURLM_OK);

        // Coleta erros de transporte (DNS, SSL, timeout...) de cada handle.
        $transportErrors = [];
        while ($info = curl_multi_info_read($multi)) {
            if ($info['result'] !== CURLE_OK) {
                $transportErrors[spl_object_id($info['handle'])] = curl_strerror($info['result']);
            }
        }

        $results = [];
        $error = null;

        foreach ($handles as $path => $handle) {
            $body = curl_multi_getcontent($handle);
            $code = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
            $curlError = $transportErrors[spl_object_id($handle)] ?? curl_error($handle);
            curl_multi_remove_handle($multi, $handle);

            if ($code === 404) {
                $error ??= new ApiException("Recurso não encontrado: {$path}", 404);
                continue;
            }

            if ($code !== 200 || !is_string($body) || $body === '') {
                $error ??= new ApiException(
                    "Falha ao consultar a PokeAPI ({$path}): " . ($curlError ?: "HTTP {$code}"),
                    502
                );
                continue;
            }

            $results[$path] = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        }

        curl_multi_close($multi);

        if ($error !== null) {
            throw $error;
        }

        return $results;
    }

    private function url(string $path): string
    {
        return str_starts_with($path, 'http') ? $path : self::BASE_URL . ltrim($path, '/');
    }
}
