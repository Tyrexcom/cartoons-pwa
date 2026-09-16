(function () {
  'use strict';

  /* === Safe localStorage wrapper === */
  var memoryFavorites = null;

  var safeStorage = {
    getItem: function (key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    setItem: function (key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        /* ignored — sandbox may block localStorage */
      }
    }
  };

  function getFavorites() {
    var raw = safeStorage.getItem('cartoons-favorites');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return {};
      }
    }
    if (memoryFavorites === null) {
      memoryFavorites = {};
    }
    return memoryFavorites;
  }

  function saveFavorites(favs) {
    safeStorage.setItem('cartoons-favorites', JSON.stringify(favs));
    if (memoryFavorites !== null) {
      memoryFavorites = favs;
    }
  }

  /* === State === */
  var cartoons = [];
  var favorites = {};
  var state = {
    search: '',
    country: '',
    age: '',
    showFavoritesOnly: false
  };
  var deferredPrompt = null;

  /* === DOM refs === */
  var el = {};
  function cacheDom() {
    el.searchInput = document.getElementById('searchInput');
    el.countryFilter = document.getElementById('countryFilter');
    el.ageFilter = document.getElementById('ageFilter');
    el.favoritesToggle = document.getElementById('favoritesToggle');
    el.cardGrid = document.getElementById('cardGrid');
    el.resultsCount = document.getElementById('resultsCount');
    el.emptyState = document.getElementById('emptyState');
    el.installBtn = document.getElementById('installBtn');
    el.toast = document.getElementById('toast');
  }

  /* === Toast === */
  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.hidden = true;
    }, 2500);
  }

  /* === Data loading === */
  function loadData() {
    return fetch('./data/cartoons.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
  }

  /* === Preload posters for offline availability ===
     Fires image requests through the browser's normal image loader so the
     service worker's fetch handler can intercept and cache each poster.
     Runs quietly in the background; failures are ignored. */
  function preloadPosters(list) {
    list.forEach(function (c) {
      if (!c.image) return;
      var img = new Image();
      img.src = c.image;
    });
  }

  /* === Filter setup === */
  function populateFilters() {
    var countries = {};
    var ages = {};
    cartoons.forEach(function (c) {
      countries[c.country] = true;
      ages[c.age] = true;
    });

    Object.keys(countries).sort().forEach(function (country) {
      var opt = document.createElement('option');
      opt.value = country;
      opt.textContent = country;
      el.countryFilter.appendChild(opt);
    });

    Object.keys(ages).sort().forEach(function (age) {
      var opt = document.createElement('option');
      opt.value = age;
      opt.textContent = age;
      el.ageFilter.appendChild(opt);
    });
  }

  /* === Filtering === */
  function getFiltered() {
    var q = state.search.trim().toLowerCase();
    return cartoons.filter(function (c) {
      if (state.showFavoritesOnly && !favorites[c.id]) return false;
      if (state.country && c.country !== state.country) return false;
      if (state.age && c.age !== state.age) return false;
      if (q) {
        var haystack = (c.title + ' ' + c.description + ' ' + c.country).toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* === Rendering === */
  function renderCard(c) {
    var isFav = !!favorites[c.id];
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-id', c.id);

    // Poster
    var poster = document.createElement('div');
    poster.className = 'card-poster';

    var img = document.createElement('img');
    img.alt = 'Постер мультфильма «' + c.title + '»';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 400;
    img.height = 600;
    img.src = c.image;
    img.onerror = function () {
      poster.innerHTML = '<div class="card-poster-fallback"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>';
    };
    poster.appendChild(img);

    // Age badge
    var ageBadge = document.createElement('span');
    ageBadge.className = 'card-age-badge';
    ageBadge.textContent = c.age;
    poster.appendChild(ageBadge);

    // Favorite button
    var favBtn = document.createElement('button');
    favBtn.className = 'card-fav-btn';
    favBtn.type = 'button';
    favBtn.setAttribute('aria-pressed', String(isFav));
    favBtn.setAttribute('aria-label', isFav ? 'Убрать из избранного' : 'Добавить в избранное');
    favBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
    favBtn.addEventListener('click', function () {
      toggleFavorite(c.id);
    });
    poster.appendChild(favBtn);

    card.appendChild(poster);

    // Body
    var body = document.createElement('div');
    body.className = 'card-body';

    var title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = c.title;
    body.appendChild(title);

    var meta = document.createElement('p');
    meta.className = 'card-meta';
    meta.textContent = c.country;
    body.appendChild(meta);

    var desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = c.description;
    body.appendChild(desc);

    // Links
    var links = document.createElement('div');
    links.className = 'card-links';

    if (c.officialSite) {
      links.appendChild(makeLink(c.officialSite, 'Официальный сайт'));
    }
    if (c.kinopoisk) {
      links.appendChild(makeLink(c.kinopoisk, 'Кинопоиск'));
    }
    if (c.ivi) {
      links.appendChild(makeLink(c.ivi, 'IVI'));
    }
    if (c.okko) {
      links.appendChild(makeLink(c.okko, 'Okko'));
    }

    body.appendChild(links);
    card.appendChild(body);

    // Attribution
    var attr = document.createElement('div');
    attr.className = 'card-attribution';
    attr.innerHTML = '<strong>Источник:</strong> ' + escapeHtml(c.imageSource) +
      ' · <strong>Правообладатель:</strong> ' + escapeHtml(c.copyright);
    card.appendChild(attr);

    return card;
  }

  function makeLink(href, label) {
    var a = document.createElement('a');
    a.className = 'card-link';
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    return a;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    var filtered = getFiltered();
    el.cardGrid.innerHTML = '';
    var frag = document.createDocumentFragment();
    filtered.forEach(function (c) {
      frag.appendChild(renderCard(c));
    });
    el.cardGrid.appendChild(frag);

    var count = filtered.length;
    el.resultsCount.textContent = count + ' ' + pluralize(count, 'мультфильм', 'мультфильма', 'мультфильмов');

    el.emptyState.hidden = count > 0;
  }

  function pluralize(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  /* === Favorites === */
  function toggleFavorite(id) {
    if (favorites[id]) {
      delete favorites[id];
      showToast('Убрано из избранного');
    } else {
      favorites[id] = true;
      showToast('Добавлено в избранное');
    }
    saveFavorites(favorites);
    render();
  }

  /* === Event listeners === */
  function bindEvents() {
    el.searchInput.addEventListener('input', function () {
      state.search = el.searchInput.value;
      render();
    });

    el.countryFilter.addEventListener('change', function () {
      state.country = el.countryFilter.value;
      render();
    });

    el.ageFilter.addEventListener('change', function () {
      state.age = el.ageFilter.value;
      render();
    });

    el.favoritesToggle.addEventListener('click', function () {
      state.showFavoritesOnly = !state.showFavoritesOnly;
      el.favoritesToggle.setAttribute('aria-pressed', String(state.showFavoritesOnly));
      render();
    });
  }

  /* === PWA install === */
  function setupInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      el.installBtn.hidden = false;
    });

    el.installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        el.installBtn.hidden = true;
      });
    });

    window.addEventListener('appinstalled', function () {
      el.installBtn.hidden = true;
      showToast('Приложение установлено');
    });
  }

  /* === Service worker === */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      var proto = location.protocol;
      if (proto === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        navigator.serviceWorker.register('./service-worker.js').catch(function () {
          /* SW registration failed — app still works online */
        });
      }
    }
  }

  /* === Theme toggle === */
  function setupTheme() {
    var toggle = document.querySelector('[data-theme-toggle]');
    var root = document.documentElement;
    var stored = safeStorage.getItem('cartoons-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');

    if (toggle) {
      updateThemeIcon(toggle, dark);
      toggle.addEventListener('click', function () {
        dark = !dark;
        root.setAttribute('data-theme', dark ? 'dark' : 'light');
        safeStorage.setItem('cartoons-theme', dark ? 'dark' : 'light');
        updateThemeIcon(toggle, dark);
      });
    }
  }

  function updateThemeIcon(toggle, dark) {
    toggle.innerHTML = dark
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    toggle.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  }

  /* === Init === */
  function init() {
    cacheDom();
    setupTheme();
    favorites = getFavorites();
    bindEvents();
    setupInstall();
    registerSW();

    loadData()
      .then(function (data) {
        cartoons = data;
        populateFilters();
        render();
        preloadPosters(cartoons);
      })
      .catch(function (err) {
        el.cardGrid.innerHTML = '';
        el.emptyState.textContent = 'Не удалось загрузить данные. Проверьте подключение к интернету.';
        el.emptyState.hidden = false;
        console.error('Data load error:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
