<?php

declare(strict_types=1);

/**
 * API JSON da Pokédex.
 *
 * Rotas (via ?route=):
 *   names                 -> [{id, name}] de todos os Pokémon
 *   types                 -> lista de tipos
 *   type&name=fire        -> ids dos Pokémon do tipo
 *   batch&ids=1,2,3       -> dados resumidos para os cards
 *   pokemon&id=25         -> detalhes completos
 */

use Pokedex\ApiException;
use Pokedex\Cache;
use Pokedex\PokeApiClient;
use Pokedex\PokedexService;

require dirname(__DIR__) . '/src/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$json = static fn (mixed $payload): string => json_encode(
    $payload,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);

try {
    $service = new PokedexService(new PokeApiClient(), new Cache(POKEDEX_CACHE_DIR));
    $route = (string) ($_GET['route'] ?? '');

    $data = match ($route) {
        'names' => $service->names(),
        'types' => $service->types(),
        'type' => $service->idsByType((string) ($_GET['name'] ?? '')),
        'batch' => $service->summaries(array_map('intval', explode(',', (string) ($_GET['ids'] ?? '')))),
        'pokemon' => $service->detail((int) ($_GET['id'] ?? 0)),
        default => throw new ApiException('Rota não encontrada.', 404),
    };

    header('Cache-Control: public, max-age=3600');
    echo $json(['data' => $data]);
} catch (ApiException $e) {
    http_response_code($e->getCode() ?: 500);
    echo $json(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo $json(['error' => 'Erro interno do servidor.', 'detail' => $e->getMessage()]);
}
