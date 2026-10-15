import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../api.js';
import { STAT_LABELS, formatName, generationOf, padId, typeColor, typeLabel } from '../utils.js';

const MAX_STAT = 255;
const MAX_ID = 1025;

const DAMAGE_GROUPS = [
  { key: 4, label: 'Muito fraco (4×)' },
  { key: 2, label: 'Fraco (2×)' },
  { key: 0.5, label: 'Resistente (½×)' },
  { key: 0.25, label: 'Muito resistente (¼×)' },
  { key: 0, label: 'Imune (0×)' },
];

/**
 * Modal com os detalhes completos de um Pokémon.
 */
export default {
  name: 'PokemonModal',
  props: {
    id: { type: Number, required: true },
  },
  emits: ['close', 'navigate'],
  setup(props, { emit }) {
    const pokemon = ref(null);
    const loading = ref(true);
    const error = ref(null);
    const tab = ref('about');
    const shiny = ref(false);
    const playing = ref(false);
    const cache = new Map();
    let audio = null;

    async function load(id) {
      error.value = null;
      shiny.value = false;

      if (cache.has(id)) {
        pokemon.value = cache.get(id);
        loading.value = false;
        return;
      }

      loading.value = true;
      try {
        const data = await api.pokemon(id);
        cache.set(id, data);
        if (props.id === id) pokemon.value = data;
      } catch (e) {
        error.value = e.message;
      } finally {
        if (props.id === id) loading.value = false;
      }
    }

    watch(() => props.id, load, { immediate: true });

    const style = computed(() => {
      const types = pokemon.value?.types ?? ['normal'];
      return {
        '--c': typeColor(types[0]),
        '--c2': typeColor(types[1] ?? types[0]),
      };
    });

    const stats = computed(() => (pokemon.value?.stats ?? []).map((s) => ({
      ...s,
      label: STAT_LABELS[s.name] ?? s.name,
      percent: Math.min(100, Math.round((s.value / MAX_STAT) * 100)),
      tier: s.value >= 120 ? 'high' : s.value >= 70 ? 'mid' : 'low',
    })));

    const damageGroups = computed(() => {
      const damage = pokemon.value?.damage ?? {};
      return DAMAGE_GROUPS
        .map((g) => ({ ...g, types: Object.keys(damage).filter((t) => damage[t] === g.key) }))
        .filter((g) => g.types.length > 0);
    });

    const generation = computed(() => (pokemon.value ? generationOf(pokemon.value.id) : null));
    const image = computed(() => (shiny.value && pokemon.value?.shiny) || pokemon.value?.sprite);

    function playCry() {
      if (!pokemon.value?.cry) return;
      audio?.pause();
      audio = new Audio(pokemon.value.cry);
      audio.volume = 0.35;
      playing.value = true;
      audio.addEventListener('ended', () => { playing.value = false; });
      audio.play().catch(() => { playing.value = false; });
    }

    function go(offset) {
      const next = props.id + offset;
      if (next >= 1 && next <= MAX_ID) emit('navigate', next);
    }

    function onKey(event) {
      if (event.key === 'Escape') emit('close');
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }

    onMounted(() => {
      document.addEventListener('keydown', onKey);
      document.body.classList.add('no-scroll');
    });

    onBeforeUnmount(() => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      audio?.pause();
    });

    return {
      MAX_ID,
      pokemon,
      loading,
      error,
      tab,
      shiny,
      playing,
      style,
      stats,
      damageGroups,
      generation,
      image,
      playCry,
      go,
      load,
      padId,
      formatName,
      typeColor,
      typeLabel,
    };
  },
  template: `
    <div class="modal" role="dialog" aria-modal="true" :aria-label="pokemon ? formatName(pokemon.name) : 'Carregando Pokémon'" @click.self="$emit('close')">
      <article class="modal__panel" :style="style">
        <button id="modal-close" class="modal__close" type="button" aria-label="Fechar" @click="$emit('close')">✕</button>

        <div v-if="error" class="state">
          <h2>Não foi possível carregar</h2>
          <p>{{ error }}</p>
          <button id="modal-retry" class="btn btn--primary" type="button" @click="load(id)">Tentar novamente</button>
        </div>

        <template v-else>
          <!-- Cabeçalho -->
          <header class="modal__hero">
            <span class="modal__watermark" aria-hidden="true">{{ pokemon ? formatName(pokemon.name) : '' }}</span>

            <div class="modal__nav">
              <button id="modal-prev" class="icon-btn" type="button" :disabled="id <= 1" aria-label="Pokémon anterior" @click="go(-1)">‹</button>
              <span class="modal__number">{{ padId(id) }}</span>
              <button id="modal-next" class="icon-btn" type="button" :disabled="id >= MAX_ID" aria-label="Próximo Pokémon" @click="go(1)">›</button>
            </div>

            <div class="modal__art" :class="{ 'is-loading': loading }">
              <img v-if="pokemon" :key="image" :src="image" :alt="formatName(pokemon.name)" width="260" height="260">
              <img v-else src="assets/img/pokeball.svg" alt="" class="loader__ball">
            </div>

            <div v-if="pokemon" class="modal__title">
              <h2>{{ formatName(pokemon.name) }}</h2>
              <p class="modal__genus">{{ pokemon.genus }}</p>
              <div class="types types--center">
                <span v-for="t in pokemon.types" :key="t" class="type" :style="{ '--c': typeColor(t) }">{{ typeLabel(t) }}</span>
                <span v-if="pokemon.is_legendary" class="badge badge--gold">Lendário</span>
                <span v-if="pokemon.is_mythical" class="badge badge--purple">Mítico</span>
              </div>
              <div class="modal__tools">
                <button id="toggle-shiny" class="btn" :class="{ 'is-active': shiny }" type="button" :disabled="!pokemon.shiny" @click="shiny = !shiny">✨ Shiny</button>
                <button id="play-cry" class="btn" :class="{ 'is-active': playing }" type="button" :disabled="!pokemon.cry" @click="playCry">🔊 Grito</button>
              </div>
            </div>
          </header>

          <!-- Abas -->
          <div v-if="pokemon" class="modal__body">
            <div class="tabs" role="tablist">
              <button id="tab-about" role="tab" class="tab" :class="{ 'is-active': tab === 'about' }" :aria-selected="tab === 'about'" @click="tab = 'about'">Sobre</button>
              <button id="tab-stats" role="tab" class="tab" :class="{ 'is-active': tab === 'stats' }" :aria-selected="tab === 'stats'" @click="tab = 'stats'">Status</button>
              <button id="tab-damage" role="tab" class="tab" :class="{ 'is-active': tab === 'damage' }" :aria-selected="tab === 'damage'" @click="tab = 'damage'">Fraquezas</button>
              <button id="tab-evolution" role="tab" class="tab" :class="{ 'is-active': tab === 'evolution' }" :aria-selected="tab === 'evolution'" @click="tab = 'evolution'">Evolução</button>
            </div>

            <Transition name="fade" mode="out-in">
              <!-- Sobre -->
              <section v-if="tab === 'about'" key="about" class="tab-panel">
                <p class="modal__description">{{ pokemon.description }}</p>
                <dl class="facts">
                  <div><dt>Altura</dt><dd>{{ pokemon.height.toFixed(1) }} m</dd></div>
                  <div><dt>Peso</dt><dd>{{ pokemon.weight.toFixed(1) }} kg</dd></div>
                  <div><dt>Exp. base</dt><dd>{{ pokemon.base_experience ?? '—' }}</dd></div>
                  <div><dt>Captura</dt><dd>{{ pokemon.capture_rate }}</dd></div>
                  <div v-if="generation"><dt>Geração</dt><dd>{{ generation.label.replace('Geração ', '') }} · {{ generation.region }}</dd></div>
                  <div><dt>Total</dt><dd>{{ pokemon.total }}</dd></div>
                </dl>
                <h3 class="section-title">Habilidades</h3>
                <div class="abilities">
                  <span v-for="a in pokemon.abilities" :key="a.name" class="ability" :class="{ 'ability--hidden': a.hidden }">
                    {{ formatName(a.name) }}<small v-if="a.hidden">oculta</small>
                  </span>
                </div>
              </section>

              <!-- Status -->
              <section v-else-if="tab === 'stats'" key="stats" class="tab-panel">
                <ul class="stats">
                  <li v-for="(s, i) in stats" :key="s.name" class="stat">
                    <span class="stat__label">{{ s.label }}</span>
                    <span class="stat__value">{{ s.value }}</span>
                    <span class="stat__track">
                      <span class="stat__bar" :class="'stat__bar--' + s.tier" :style="{ width: s.percent + '%', animationDelay: i * 70 + 'ms' }"></span>
                    </span>
                  </li>
                  <li class="stat stat--total">
                    <span class="stat__label">Total</span>
                    <span class="stat__value">{{ pokemon.total }}</span>
                    <span></span>
                  </li>
                </ul>
              </section>

              <!-- Fraquezas -->
              <section v-else-if="tab === 'damage'" key="damage" class="tab-panel">
                <p class="hint">Multiplicador de dano recebido de cada tipo de ataque.</p>
                <div v-for="g in damageGroups" :key="g.key" class="damage-group">
                  <h3 class="section-title">{{ g.label }}</h3>
                  <div class="types">
                    <span v-for="t in g.types" :key="t" class="type type--lg" :style="{ '--c': typeColor(t) }">{{ typeLabel(t) }}</span>
                  </div>
                </div>
              </section>

              <!-- Evolução -->
              <section v-else key="evolution" class="tab-panel">
                <p v-if="pokemon.evolutions.length === 1" class="hint">Este Pokémon não evolui.</p>
                <div v-else class="evolution">
                  <template v-for="(stage, si) in pokemon.evolutions" :key="si">
                    <span v-if="si > 0" class="evolution__arrow" aria-hidden="true">→</span>
                    <div class="evolution__stage">
                      <button
                        v-for="evo in stage"
                        :key="evo.id"
                        :id="'evolution-' + evo.id"
                        class="evo"
                        :class="{ 'is-current': evo.id === pokemon.id }"
                        type="button"
                        :disabled="evo.id > MAX_ID"
                        @click="$emit('navigate', evo.id)"
                      >
                        <img :src="evo.sprite" :alt="formatName(evo.name)" loading="lazy" width="84" height="84">
                        <span class="evo__name">{{ formatName(evo.name) }}</span>
                        <small v-if="evo.condition" class="evo__condition">{{ evo.condition }}</small>
                      </button>
                    </div>
                  </template>
                </div>
              </section>
            </Transition>
          </div>
        </template>
      </article>
    </div>
  `,
};
