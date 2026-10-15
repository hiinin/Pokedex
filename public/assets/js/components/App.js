import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../api.js';
import { GENERATIONS, typeColor, typeLabel } from '../utils.js';
import PokemonCard from './PokemonCard.js';
import PokemonModal from './PokemonModal.js';

const PAGE_SIZE = 24;
const BATCH_SIZE = 48;

/**
 * Componente raiz: busca, filtros, grade com scroll infinito.
 */
export default {
  name: 'App',
  components: { PokemonCard, PokemonModal },
  setup() {
    // ---------- Estado ----------
    const names = ref([]);
    const types = ref([]);
    const summaries = reactive({});
    const pending = new Set();

    const booting = ref(true);
    const error = ref(null);
    const loadingBatch = ref(false);

    const query = ref('');
    const debouncedQuery = ref('');
    const selectedType = ref('');
    const typeIds = ref(null);
    const typeLoading = ref(false);
    const generation = ref('');
    const sort = ref('id-asc');
    const visibleCount = ref(PAGE_SIZE);
    const selectedId = ref(null);

    const sentinel = ref(null);
    let observer = null;
    let debounceTimer = null;

    // ---------- Busca com debounce ----------
    watch(query, (value) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debouncedQuery.value = value.trim().toLowerCase();
      }, 200);
    });

    // ---------- Filtro por tipo (ids vindos da API) ----------
    watch(selectedType, async (type) => {
      if (!type) {
        typeIds.value = null;
        return;
      }

      typeLoading.value = true;
      try {
        const ids = await api.idsByType(type);
        if (selectedType.value === type) {
          typeIds.value = new Set(ids);
        }
      } catch (e) {
        error.value = e.message;
      } finally {
        typeLoading.value = false;
      }
    });

    // ---------- Lista filtrada ----------
    const filtered = computed(() => {
      let list = names.value;
      const q = debouncedQuery.value.replace(/^#/, '');

      if (q) {
        if (/^\d+$/.test(q)) {
          const n = String(Number(q));
          list = list.filter((p) => String(p.id).startsWith(n));
        } else {
          const slug = q.replace(/\s+/g, '-');
          list = list.filter((p) => p.name.includes(slug));
        }
      }

      if (typeIds.value) {
        list = list.filter((p) => typeIds.value.has(p.id));
      }

      if (generation.value) {
        const gen = GENERATIONS.find((g) => g.id === Number(generation.value));
        list = list.filter((p) => p.id >= gen.from && p.id <= gen.to);
      }

      const sorted = [...list];
      switch (sort.value) {
        case 'id-desc':
          sorted.sort((a, b) => b.id - a.id);
          break;
        case 'name-asc':
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'name-desc':
          sorted.sort((a, b) => b.name.localeCompare(a.name));
          break;
      }

      return sorted;
    });

    const visible = computed(() => filtered.value.slice(0, visibleCount.value));
    const hasMore = computed(() => visibleCount.value < filtered.value.length);
    const isFiltering = computed(() => Boolean(debouncedQuery.value || selectedType.value || generation.value));

    // Volta para a primeira página ao mudar filtros.
    watch([debouncedQuery, typeIds, generation, sort], () => {
      visibleCount.value = PAGE_SIZE;
    });

    // ---------- Carregamento dos cards em lote ----------
    async function loadSummaries(ids) {
      const missing = ids.filter((id) => !summaries[id] && !pending.has(id));
      if (missing.length === 0) return;

      missing.forEach((id) => pending.add(id));
      loadingBatch.value = true;

      const chunks = [];
      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        chunks.push(missing.slice(i, i + BATCH_SIZE));
      }

      try {
        await Promise.all(chunks.map(async (chunk) => {
          const data = await api.batch(chunk);
          data.forEach((p) => { summaries[p.id] = p; });
        }));
      } catch (e) {
        error.value = e.message;
      } finally {
        missing.forEach((id) => pending.delete(id));
        loadingBatch.value = pending.size > 0;
      }
    }

    watch(visible, (list) => loadSummaries(list.map((p) => p.id)));

    // ---------- Scroll infinito ----------
    function recheckSentinel() {
      if (!observer || !sentinel.value) return;
      observer.unobserve(sentinel.value);
      observer.observe(sentinel.value);
    }

    watch(visibleCount, () => nextTick(recheckSentinel));

    function setupObserver() {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore.value && !booting.value) {
          visibleCount.value += PAGE_SIZE;
        }
      }, { rootMargin: '800px 0px' });

      if (sentinel.value) observer.observe(sentinel.value);
    }

    // ---------- Ações ----------
    function toggleType(type) {
      selectedType.value = selectedType.value === type ? '' : type;
    }

    function clearFilters() {
      query.value = '';
      debouncedQuery.value = '';
      selectedType.value = '';
      generation.value = '';
      sort.value = 'id-asc';
    }

    // ---------- Modal (rota por hash: #/pokemon/25) ----------
    function readHash() {
      const match = window.location.hash.match(/^#\/pokemon\/(\d+)$/);
      selectedId.value = match ? Number(match[1]) : null;
    }

    function openPokemon(id) {
      window.location.hash = `/pokemon/${id}`;
    }

    function closeModal() {
      if (window.location.hash) {
        history.pushState('', document.title, window.location.pathname + window.location.search);
      }
      selectedId.value = null;
    }

    function openRandom() {
      const max = names.value.length || 1025;
      openPokemon(Math.floor(Math.random() * max) + 1);
    }

    async function boot() {
      booting.value = true;
      error.value = null;
      try {
        const [allNames, allTypes] = await Promise.all([api.names(), api.types()]);
        names.value = allNames;
        types.value = allTypes;
      } catch (e) {
        error.value = e.message;
      } finally {
        booting.value = false;
        nextTick(recheckSentinel);
      }
    }

    onMounted(() => {
      setupObserver();
      readHash();
      window.addEventListener('hashchange', readHash);
      boot();
    });

    onBeforeUnmount(() => {
      observer?.disconnect();
      window.removeEventListener('hashchange', readHash);
    });

    return {
      GENERATIONS,
      names,
      types,
      summaries,
      booting,
      error,
      loadingBatch,
      query,
      selectedType,
      typeLoading,
      generation,
      sort,
      filtered,
      visible,
      hasMore,
      isFiltering,
      selectedId,
      sentinel,
      toggleType,
      clearFilters,
      openPokemon,
      closeModal,
      openRandom,
      boot,
      typeColor,
      typeLabel,
    };
  },
  template: `
    <header class="header">
      <div class="container header__inner">
        <a href="./" class="brand" id="brand-link">
          <img src="assets/img/pokeball.svg" alt="" class="brand__logo">
          Pokédex
        </a>
        <nav class="header__actions" aria-label="Ações">
          <button id="random-button" class="btn btn--primary" type="button" @click="openRandom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
            <span class="btn__label">Surpreenda-me</span>
          </button>
        </nav>
      </div>
    </header>

    <section class="hero container">
      <span class="hero__eyebrow"><span class="dot"></span>{{ names.length || 1025 }} Pokémon · dados da PokeAPI</span>
      <h1 class="hero__title">Encontre seu <span>Pokémon</span></h1>
      <p class="hero__subtitle">
        Busque por nome ou número, filtre por tipo e geração e descubra status,
        fraquezas e evoluções de cada criatura.
      </p>
    </section>

    <main class="container">
      <section class="toolbar" aria-label="Busca e filtros">
        <div class="toolbar__row">
          <label class="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input
              id="search-input"
              v-model="query"
              type="search"
              placeholder="Buscar por nome ou número (ex.: pikachu, 25)"
              autocomplete="off"
              aria-label="Buscar Pokémon"
            >
            <button v-if="query" class="search__clear" id="search-clear" type="button" aria-label="Limpar busca" @click="query = ''">✕</button>
          </label>

          <select id="generation-select" v-model="generation" class="select" aria-label="Filtrar por geração">
            <option value="">Todas as gerações</option>
            <option v-for="g in GENERATIONS" :key="g.id" :value="g.id">{{ g.label }} · {{ g.region }}</option>
          </select>

          <select id="sort-select" v-model="sort" class="select" aria-label="Ordenar">
            <option value="id-asc">Número ↑</option>
            <option value="id-desc">Número ↓</option>
            <option value="name-asc">Nome A–Z</option>
            <option value="name-desc">Nome Z–A</option>
          </select>
        </div>

        <div class="chips" role="group" aria-label="Filtrar por tipo">
          <button
            id="type-all"
            class="chip"
            :class="{ 'is-active': !selectedType }"
            type="button"
            @click="selectedType = ''"
          >Todos</button>
          <button
            v-for="t in types"
            :key="t"
            :id="'type-' + t"
            class="chip"
            :class="{ 'is-active': selectedType === t }"
            :style="{ '--c': typeColor(t) }"
            type="button"
            @click="toggleType(t)"
          ><span class="chip__dot"></span>{{ typeLabel(t) }}</button>
        </div>
      </section>

      <div v-if="!booting && !error" class="results-info">
        <span>Mostrando <strong>{{ visible.length }}</strong> de <strong>{{ filtered.length }}</strong> Pokémon</span>
        <button v-if="isFiltering" id="clear-filters" class="btn" type="button" @click="clearFilters">Limpar filtros</button>
      </div>

      <div v-if="error" class="state" role="alert">
        <img src="assets/img/pokeball.svg" alt="" class="state__icon">
        <h2>Ops! Algo deu errado.</h2>
        <p>{{ error }}</p>
        <button id="retry-button" class="btn btn--primary" type="button" @click="boot">Tentar novamente</button>
      </div>

      <div v-else-if="booting || typeLoading" class="grid" aria-busy="true">
        <div v-for="n in 12" :key="n" class="card card--skeleton">
          <div class="skeleton" style="width:56px;height:14px"></div>
          <div class="skeleton" style="width:120px;height:120px;margin:1.2rem auto;border-radius:50%"></div>
          <div class="skeleton" style="width:60%;height:20px;margin-bottom:.7rem"></div>
          <div class="skeleton" style="width:40%;height:18px"></div>
        </div>
      </div>

      <div v-else-if="filtered.length === 0" class="state">
        <img src="assets/img/pokeball.svg" alt="" class="state__icon">
        <h2>Nenhum Pokémon encontrado</h2>
        <p>Tente outro nome, número ou remova alguns filtros.</p>
        <button id="empty-clear" class="btn" type="button" @click="clearFilters">Limpar filtros</button>
      </div>

      <section v-else class="grid" aria-label="Lista de Pokémon">
        <template v-for="(p, i) in visible" :key="p.id">
          <PokemonCard
            v-if="summaries[p.id]"
            :pokemon="summaries[p.id]"
            :index="i"
            @open="openPokemon"
          />
          <div v-else class="card card--skeleton">
            <div class="skeleton" style="width:56px;height:14px"></div>
            <div class="skeleton" style="width:120px;height:120px;margin:1.2rem auto;border-radius:50%"></div>
            <div class="skeleton" style="width:60%;height:20px;margin-bottom:.7rem"></div>
            <div class="skeleton" style="width:40%;height:18px"></div>
          </div>
        </template>
      </section>

      <div ref="sentinel" class="sentinel" aria-hidden="true"></div>
      <div v-if="hasMore && loadingBatch" class="loader">
        <img src="assets/img/pokeball.svg" alt="Carregando" class="loader__ball">
      </div>
    </main>

    <footer class="footer">
      <div class="container">
        Feito com PHP + Vue 3 · Dados de <a href="https://pokeapi.co" target="_blank" rel="noopener">PokeAPI</a>.
        Pokémon e nomes relacionados são marcas de Nintendo, Game Freak e The Pokémon Company.
      </div>
    </footer>

    <Transition name="modal">
      <PokemonModal
        v-if="selectedId"
        :id="selectedId"
        @close="closeModal"
        @navigate="openPokemon"
      />
    </Transition>
  `,
};
