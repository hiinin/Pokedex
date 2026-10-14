<?php

declare(strict_types=1);

namespace Pokedex;

use RuntimeException;

/**
 * Exceção com código HTTP para respostas de erro da API.
 */
final class ApiException extends RuntimeException
{
}
