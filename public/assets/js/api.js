/**
 * Cliente da API PHP (public/api.php).
 */
const BASE_URL = 'api.php';

async function request(params) {
  const response = await fetch(`${BASE_URL}?${new URLSearchParams(params)}`);
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json.error || `Erro ${response.status} ao consultar a API.`);
  }

  return json.data;
}

export const api = {
  names: () => request({ route: 'names' }),
  types: () => request({ route: 'types' }),
  idsByType: (name) => request({ route: 'type', name }),
  batch: (ids) => request({ route: 'batch', ids: ids.join(',') }),
  pokemon: (id) => request({ route: 'pokemon', id }),
};
