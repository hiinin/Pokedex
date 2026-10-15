/**
 * Utilitários e traduções compartilhados pelos componentes.
 */

export const TYPE_LABELS = {
  normal: 'Normal',
  fire: 'Fogo',
  water: 'Água',
  electric: 'Elétrico',
  grass: 'Planta',
  ice: 'Gelo',
  fighting: 'Lutador',
  poison: 'Venenoso',
  ground: 'Terra',
  flying: 'Voador',
  psychic: 'Psíquico',
  bug: 'Inseto',
  rock: 'Pedra',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  dark: 'Sombrio',
  steel: 'Aço',
  fairy: 'Fada',
};

export const STAT_LABELS = {
  hp: 'HP',
  attack: 'Ataque',
  defense: 'Defesa',
  'special-attack': 'At. Esp.',
  'special-defense': 'Def. Esp.',
  speed: 'Velocidade',
};

export const GENERATIONS = [
  { id: 1, label: 'Geração I', region: 'Kanto', from: 1, to: 151 },
  { id: 2, label: 'Geração II', region: 'Johto', from: 152, to: 251 },
  { id: 3, label: 'Geração III', region: 'Hoenn', from: 252, to: 386 },
  { id: 4, label: 'Geração IV', region: 'Sinnoh', from: 387, to: 493 },
  { id: 5, label: 'Geração V', region: 'Unova', from: 494, to: 649 },
  { id: 6, label: 'Geração VI', region: 'Kalos', from: 650, to: 721 },
  { id: 7, label: 'Geração VII', region: 'Alola', from: 722, to: 809 },
  { id: 8, label: 'Geração VIII', region: 'Galar', from: 810, to: 905 },
  { id: 9, label: 'Geração IX', region: 'Paldea', from: 906, to: 1025 },
];

export const typeColor = (type) => `var(--type-${type})`;

export const typeLabel = (type) => TYPE_LABELS[type] ?? type;

export const padId = (id) => `#${String(id).padStart(4, '0')}`;

export const formatName = (name = '') => name.replace(/-/g, ' ');

export const generationOf = (id) => GENERATIONS.find((g) => id >= g.from && id <= g.to);
