import { computed } from 'vue';
import { formatName, padId, typeColor, typeLabel } from '../utils.js';

/**
 * Card de um Pokémon na grade.
 */
export default {
  name: 'PokemonCard',
  props: {
    pokemon: { type: Object, required: true },
    index: { type: Number, default: 0 },
  },
  emits: ['open'],
  setup(props) {
    const style = computed(() => ({
      '--c': typeColor(props.pokemon.types[0]),
      '--c2': typeColor(props.pokemon.types[1] ?? props.pokemon.types[0]),
      animationDelay: `${(props.index % 24) * 25}ms`,
    }));

    return {
      style,
      number: computed(() => padId(props.pokemon.id)),
      name: computed(() => formatName(props.pokemon.name)),
      typeColor,
      typeLabel,
    };
  },
  template: `
    <article class="card" :style="style">
      <div class="card__top">
        <span class="card__number">{{ number }}</span>
        <slot name="action"></slot>
      </div>

      <div class="card__image">
        <img :src="pokemon.sprite" :alt="name" loading="lazy" width="140" height="140">
      </div>

      <h3 class="card__name">{{ name }}</h3>

      <div class="card__footer">
        <div class="types">
          <span v-for="t in pokemon.types" :key="t" class="type" :style="{ '--c': typeColor(t) }">
            {{ typeLabel(t) }}
          </span>
        </div>
        <span class="card__total">Total <b>{{ pokemon.total }}</b></span>
      </div>

      <button
        class="card__open"
        :id="'open-pokemon-' + pokemon.id"
        :aria-label="'Ver detalhes de ' + name"
        @click="$emit('open', pokemon.id)"
      ></button>
    </article>
  `,
};
