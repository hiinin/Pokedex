<?php

declare(strict_types=1);

namespace Pokedex;

/**
 * Regras de negócio da Pokédex: consulta a PokeAPI, transforma as respostas
 * em payloads enxutos para o frontend e armazena o resultado em cache.
 */
final class PokedexService
{
    /** Último Pokémon da Pokédex Nacional considerado. */
    public const MAX_ID = 1025;

    /** Limite de Pokémon por requisição em lote. */
    public const MAX_BATCH = 60;

    private const ARTWORK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/%d.png';

    private const IGNORED_TYPES = ['unknown', 'shadow', 'stellar'];

    public function __construct(
        private readonly PokeApiClient $api,
        private readonly Cache $cache
    ) {
    }

    /**
     * Lista com id e nome de todos os Pokémon (usada na busca do frontend).
     *
     * @return array<int, array{id:int, name:string}>
     */
    public function names(): array
    {
        return $this->cache->remember('names', function (): array {
            $data = $this->api->get('pokemon-species?limit=' . self::MAX_ID);

            $names = [];
            foreach ($data['results'] as $item) {
                $id = self::idFromUrl($item['url']);
                if ($id <= self::MAX_ID) {
                    $names[] = ['id' => $id, 'name' => $item['name']];
                }
            }

            usort($names, static fn (array $a, array $b): int => $a['id'] <=> $b['id']);

            return $names;
        });
    }

    /**
     * @return string[] Nomes dos tipos jogáveis.
     */
    public function types(): array
    {
        return $this->cache->remember('types', function (): array {
            $data = $this->api->get('type?limit=50');

            $types = array_map(static fn (array $t): string => $t['name'], $data['results']);

            return array_values(array_diff($types, self::IGNORED_TYPES));
        });
    }

    /**
     * @return int[] IDs dos Pokémon que possuem o tipo informado.
     */
    public function idsByType(string $type): array
    {
        $type = strtolower(trim($type));
        if (!in_array($type, $this->types(), true)) {
            throw new ApiException("Tipo inválido: {$type}", 400);
        }

        return $this->cache->remember("type:{$type}", function () use ($type): array {
            $data = $this->api->get("type/{$type}");

            $ids = [];
            foreach ($data['pokemon'] as $entry) {
                $id = self::idFromUrl($entry['pokemon']['url']);
                if ($id <= self::MAX_ID) {
                    $ids[] = $id;
                }
            }

            $ids = array_values(array_unique($ids));
            sort($ids);

            return $ids;
        });
    }

    /**
     * Dados resumidos (para os cards) de vários Pokémon.
     *
     * @param int[] $ids
     */
    public function summaries(array $ids): array
    {
        $ids = array_values(array_unique(array_filter(
            $ids,
            static fn (int $id): bool => $id >= 1 && $id <= self::MAX_ID
        )));

        if ($ids === []) {
            throw new ApiException('Informe ao menos um id válido.', 400);
        }

        if (count($ids) > self::MAX_BATCH) {
            throw new ApiException('Máximo de ' . self::MAX_BATCH . ' Pokémon por requisição.', 400);
        }

        $result = [];
        $missing = [];

        foreach ($ids as $id) {
            $cached = $this->cache->get("summary:{$id}");
            if ($cached !== null) {
                $result[$id] = $cached;
            } else {
                $missing[] = $id;
            }
        }

        if ($missing !== []) {
            $responses = $this->api->getMany(array_map(static fn (int $id): string => "pokemon/{$id}", $missing));

            foreach ($missing as $id) {
                $summary = $this->summarize($responses["pokemon/{$id}"]);
                $this->cache->set("summary:{$id}", $summary);
                $result[$id] = $summary;
            }
        }

        // Mantém a ordem solicitada.
        return array_map(static fn (int $id): array => $result[$id], $ids);
    }

    /**
     * Detalhes completos de um Pokémon.
     */
    public function detail(int $id): array
    {
        if ($id < 1 || $id > self::MAX_ID) {
            throw new ApiException('Pokémon não encontrado.', 404);
        }

        return $this->cache->remember("detail:{$id}", function () use ($id): array {
            $responses = $this->api->getMany(["pokemon/{$id}", "pokemon-species/{$id}"]);
            $pokemon = $responses["pokemon/{$id}"];
            $species = $responses["pokemon-species/{$id}"];

            $types = array_map(static fn (array $t): string => $t['type']['name'], $pokemon['types']);
            $chain = $this->api->get($species['evolution_chain']['url']);

            return [
                ...$this->summarize($pokemon),
                'genus' => $this->localized($species['genera'], 'genus'),
                'description' => $this->flavorText($species['flavor_text_entries']),
                'height' => $pokemon['height'] / 10,  // metros
                'weight' => $pokemon['weight'] / 10,  // quilos
                'base_experience' => $pokemon['base_experience'],
                'generation' => $species['generation']['name'] ?? null,
                'is_legendary' => (bool) $species['is_legendary'],
                'is_mythical' => (bool) $species['is_mythical'],
                'capture_rate' => $species['capture_rate'],
                'shiny' => $pokemon['sprites']['other']['official-artwork']['front_shiny'] ?? null,
                'cry' => $pokemon['cries']['latest'] ?? null,
                'abilities' => array_map(static fn (array $a): array => [
                    'name' => $a['ability']['name'],
                    'hidden' => (bool) $a['is_hidden'],
                ], $pokemon['abilities']),
                'stats' => array_map(static fn (array $s): array => [
                    'name' => $s['stat']['name'],
                    'value' => $s['base_stat'],
                ], $pokemon['stats']),
                'damage' => $this->damageRelations($types),
                'evolutions' => $this->evolutionStages($chain['chain']),
            ];
        });
    }

    private function summarize(array $pokemon): array
    {
        $stats = array_sum(array_map(static fn (array $s): int => $s['base_stat'], $pokemon['stats']));

        return [
            'id' => $pokemon['id'],
            'name' => $pokemon['species']['name'] ?? $pokemon['name'],
            'types' => array_map(static fn (array $t): string => $t['type']['name'], $pokemon['types']),
            'sprite' => $pokemon['sprites']['other']['official-artwork']['front_default']
                ?? $pokemon['sprites']['front_default']
                ?? sprintf(self::ARTWORK_URL, $pokemon['id']),
            'total' => $stats,
        ];
    }

    /**
     * Calcula o multiplicador de dano recebido de cada tipo atacante.
     *
     * @param string[] $defenderTypes
     * @return array<string, float> Apenas multiplicadores diferentes de 1.
     */
    private function damageRelations(array $defenderTypes): array
    {
        $relations = [];
        foreach ($defenderTypes as $type) {
            $relations[$type] = $this->cache->remember("relations:{$type}", function () use ($type): array {
                $data = $this->api->get("type/{$type}")['damage_relations'];
                $names = static fn (array $list): array => array_map(static fn (array $t): string => $t['name'], $list);

                return [
                    'double' => $names($data['double_damage_from']),
                    'half' => $names($data['half_damage_from']),
                    'none' => $names($data['no_damage_from']),
                ];
            });
        }

        $result = [];
        foreach ($this->types() as $attacker) {
            $multiplier = 1.0;
            foreach ($relations as $relation) {
                if (in_array($attacker, $relation['none'], true)) {
                    $multiplier *= 0;
                } elseif (in_array($attacker, $relation['double'], true)) {
                    $multiplier *= 2;
                } elseif (in_array($attacker, $relation['half'], true)) {
                    $multiplier *= 0.5;
                }
            }

            if ($multiplier !== 1.0) {
                $result[$attacker] = $multiplier;
            }
        }

        arsort($result);

        return $result;
    }

    /**
     * Converte a árvore de evolução em estágios (lista de listas),
     * o que facilita exibir ramificações como a do Eevee.
     */
    private function evolutionStages(array $node): array
    {
        $stages = [];
        $current = [['node' => $node, 'details' => []]];

        while ($current !== []) {
            $stage = [];
            $next = [];

            foreach ($current as $item) {
                $id = self::idFromUrl($item['node']['species']['url']);
                $stage[] = [
                    'id' => $id,
                    'name' => $item['node']['species']['name'],
                    'sprite' => sprintf(self::ARTWORK_URL, $id),
                    'condition' => $this->evolutionCondition($item['details']),
                ];

                foreach ($item['node']['evolves_to'] as $child) {
                    $next[] = ['node' => $child, 'details' => $child['evolution_details'][0] ?? []];
                }
            }

            $stages[] = $stage;
            $current = $next;
        }

        return $stages;
    }

    private function evolutionCondition(array $details): ?string
    {
        if ($details === []) {
            return null;
        }

        $trigger = $details['trigger']['name'] ?? '';

        return match (true) {
            !empty($details['min_level']) => 'Nv. ' . $details['min_level'],
            !empty($details['item']) => self::humanize($details['item']['name']),
            $trigger === 'trade' => 'Troca' . (!empty($details['held_item']) ? ' + ' . self::humanize($details['held_item']['name']) : ''),
            !empty($details['min_happiness']) => 'Amizade' . (!empty($details['time_of_day']) ? ' (' . ($details['time_of_day'] === 'day' ? 'dia' : 'noite') . ')' : ''),
            !empty($details['known_move']) => 'Golpe: ' . self::humanize($details['known_move']['name']),
            !empty($details['location']) => 'Local: ' . self::humanize($details['location']['name']),
            default => $trigger !== '' ? self::humanize($trigger) : null,
        };
    }

    private function flavorText(array $entries): ?string
    {
        foreach (['pt-br', 'pt', 'en'] as $language) {
            $matches = array_filter($entries, static fn (array $e): bool => strtolower($e['language']['name']) === $language);
            if ($matches !== []) {
                $text = end($matches)['flavor_text'];

                return trim(preg_replace('/\s+/u', ' ', str_replace(["\f", "\u{00AD}"], [' ', ''], $text)));
            }
        }

        return null;
    }

    private function localized(array $entries, string $field): ?string
    {
        foreach (['pt-br', 'pt', 'en'] as $language) {
            foreach ($entries as $entry) {
                if (strtolower($entry['language']['name']) === $language) {
                    return $entry[$field];
                }
            }
        }

        return null;
    }

    private static function idFromUrl(string $url): int
    {
        return (int) basename(rtrim($url, '/'));
    }

    private static function humanize(string $slug): string
    {
        return ucwords(str_replace('-', ' ', $slug));
    }
}
