(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Tiny safe element builder — never uses innerHTML with data from the API. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  const svg = (inner) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`; // static icon markup only
    return wrap.firstChild;
  };
  const ICON = {
    external: '<path d="M7 17 17 7M8 7h9v9"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  };

  /* ---------- Fetch site data from the backend ---------- */
  async function load() {
    const res = await fetch('/api/site', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Failed to load site data');
    return res.json();
  }

  /* ---------- Bind simple text fields: data-bind="key" ---------- */
  function bindSettings(s) {
    $$('[data-bind]').forEach((el) => {
      const v = s[el.dataset.bind];
      if (v != null) el.textContent = v;
    });
    document.title = `${s.short_name} — ${s.headline}`;

    // Hero name: highlight the middle word like the original design
    const parts = (s.full_name || '').trim().split(/\s+/);
    const name = $('#heroName');
    name.textContent = '';
    if (parts.length >= 3) {
      name.append(parts[0] + ' ', h('em', { text: parts[1] }), h('br'), parts.slice(2).join(' '));
    } else if (parts.length === 2) {
      name.append(parts[0] + ' ', h('em', { text: parts[1] }));
    } else {
      name.append(h('em', { text: s.full_name || '' }));
    }
  }

  /* ---------- Typed role line ---------- */
  function startTyped(roles) {
    const out = $('#typed');
    const list = (roles || '').split('|').map((r) => r.trim()).filter(Boolean);
    if (!list.length) return;
    if (reduceMotion) { out.textContent = list[0]; return; }
    let i = 0, c = 0, del = false;
    (function tick() {
      const word = list[i];
      out.textContent = word.slice(0, c);
      let wait = del ? 35 : 75;
      if (!del && c === word.length) { del = true; wait = 1600; }
      else if (del && c === 0) { del = false; i = (i + 1) % list.length; wait = 400; }
      else c += del ? -1 : 1;
      setTimeout(tick, wait);
    })();
  }

  /* ---------- Stats ---------- */
  function renderStats(data) {
    const cats = new Set(data.skills.map((s) => s.category));
    const items = [
      [data.projects.length, 'Projects'],
      [data.skills.length, 'Technologies'],
      [cats.size, 'Skill areas'],
    ];
    const root = $('#stats');
    root.textContent = '';
    items.forEach(([n, label]) => {
      const b = h('b', { text: '0', 'data-to': n });
      root.append(h('div', { class: 'stat' }, b, h('span', { text: label })));
    });
  }
  function countUp() {
    $$('.stat b').forEach((b) => {
      const to = +b.dataset.to;
      if (reduceMotion || to === 0) { b.textContent = to; return; }
      const t0 = performance.now(), dur = 1100;
      (function step(t) {
        const p = Math.min(1, (t - t0) / dur);
        b.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  /* ---------- Skills ---------- */
  function renderSkills(skills) {
    const root = $('#skillsRoot');
    root.textContent = '';
    const groups = new Map();
    skills.forEach((s) => {
      if (!groups.has(s.category)) groups.set(s.category, []);
      groups.get(s.category).push(s);
    });
    groups.forEach((list, cat) => {
      const grid = h('div', { class: 'skills-grid' });
      list.forEach((s, i) => {
        const bar = h('i');
        bar.style.setProperty('--level', String(Math.max(0.04, s.level / 100)));
        const chip = h('div', { class: 'skill-chip reveal' }, h('div', { class: 'skill-top' }, h('span', { text: s.name })), h('div', { class: 'bar' }, bar));
        chip.style.setProperty('--d', `${Math.min(i, 8) * 0.05}s`);
        grid.append(chip);
      });
      root.append(h('div', { class: 'skill-group' }, h('h3', { text: cat }), grid));
    });
    observeReveals(root);
  }

  /* ---------- Projects ---------- */
  let ALL_PROJECTS = [];
  let activeTag = 'All';

  function renderFilters() {
    const tags = ['All', ...new Set(ALL_PROJECTS.flatMap((p) => p.tags))];
    const root = $('#filters');
    root.textContent = '';
    if (tags.length <= 2) { root.hidden = true; return; }
    tags.forEach((t) => {
      root.append(h('button', {
        class: 'filter', type: 'button', text: t,
        'aria-pressed': String(t === activeTag),
        onclick: () => { activeTag = t; renderFilters(); renderProjects(); },
      }));
    });
  }

  function renderProjects() {
    const root = $('#projectsRoot');
    root.textContent = '';
    const list = ALL_PROJECTS.filter((p) => activeTag === 'All' || p.tags.includes(activeTag));
    if (!list.length) { root.append(h('p', { class: 'empty', text: 'No projects to show yet.' })); return; }
    list.forEach((p, i) => {
      const links = h('div', { class: 'project-links' });
      if (p.repo_url) links.append(h('a', { href: p.repo_url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${p.title} source code` }, svg(ICON.github)));
      if (p.live_url) links.append(h('a', { href: p.live_url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${p.title} live site` }, svg(ICON.external)));

      const card = h('article', { class: 'project-card reveal' },
        h('div', { class: 'project-index', text: String(i + 1).padStart(2, '0') }),
        h('div', {},
          h('div', { class: 'project-title' }, h('span', { text: p.title }), p.featured ? h('span', { class: 'badge', text: 'Featured' }) : null),
          h('p', { class: 'project-desc', text: p.description }),
          h('div', { class: 'project-tags' }, p.tags.map((t) => h('span', { text: t })))
        ),
        links
      );
      card.style.setProperty('--d', `${Math.min(i, 5) * 0.06}s`);
      root.append(card);
    });
    observeReveals(root);
  }

  /* ---------- Contact links ---------- */
  function renderContactLinks(s) {
    const root = $('#contactLinks');
    root.textContent = '';
    if (s.email) root.append(h('a', { class: 'btn primary', href: `mailto:${s.email}` }, svg(ICON.mail), 'Email me'));
    if (s.github) root.append(h('a', { class: 'btn', href: s.github, target: '_blank', rel: 'noopener noreferrer' }, svg(ICON.github), 'GitHub'));
    if (s.linkedin) root.append(h('a', { class: 'btn', href: s.linkedin, target: '_blank', rel: 'noopener noreferrer' }, svg(ICON.linkedin), 'LinkedIn'));
  }

  /* ---------- Reveal on scroll ---------- */
  let io;
  function observeReveals(scope = document) {
    const els = $$('.reveal:not(.in-view)', scope);
    if (!('IntersectionObserver' in window) || reduceMotion) { els.forEach((e) => e.classList.add('in-view')); return; }
    io = io || new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in-view');
        if (en.target.id === 'stats') countUp();
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- Contact form ---------- */
  function setupForm() {
    const form = $('#contactForm');
    const status = $('#formStatus');
    const btn = $('#sendBtn');
    const msg = $('#cMessage');
    const counter = $('#counter');

    msg.addEventListener('input', () => { counter.textContent = `${msg.value.length} / 3000`; });

    const setErr = (name, text) => {
      const slot = $(`[data-err="${name}"]`, form);
      if (!slot) return;
      slot.textContent = text || '';
      slot.closest('.field').classList.toggle('invalid', !!text);
    };
    const clearErrs = () => ['name', 'email', 'message'].forEach((n) => setErr(n, ''));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrs();
      status.className = 'form-status';
      status.textContent = '';

      const data = Object.fromEntries(new FormData(form).entries());
      // Quick client-side check (server validates again)
      let bad = false;
      if ((data.name || '').trim().length < 2) { setErr('name', 'Please enter your name.'); bad = true; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((data.email || '').trim())) { setErr('email', 'Please enter a valid email address.'); bad = true; }
      if ((data.message || '').trim().length < 10) { setErr('message', 'Message should be at least 10 characters.'); bad = true; }
      if (bad) return;

      btn.disabled = true;
      const label = btn.firstChild.textContent;
      btn.firstChild.textContent = 'Sending… ';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (json.errors) Object.entries(json.errors).forEach(([k, v]) => setErr(k, v));
          throw new Error(json.error || 'Could not send your message.');
        }
        form.reset();
        counter.textContent = '0 / 3000';
        status.classList.add('ok');
        status.textContent = 'Thanks! Your message is in — I\'ll reply soon.';
      } catch (err) {
        status.classList.add('bad');
        status.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.firstChild.textContent = label;
      }
    });
  }

  /* ---------- Header, theme, scroll effects ---------- */
  function setupChrome() {
    // Theme toggle
    $('#themeBtn').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'light' ? '#F7F3EA' : '#0F1419');
    });

    // Mobile menu
    const menuBtn = $('#menuBtn'), links = $('#navLinks');
    const closeMenu = () => { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); };
    menuBtn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    $$('a', links).forEach((a) => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    // Scroll progress, back-to-top, active link
    const progress = $('#progress'), toTop = $('#toTop');
    const sections = $$('main section[id]').filter((s) => $(`.nav-links a[href="#${s.id}"]`));
    let ticking = false;
    function onScroll() {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      toTop.classList.toggle('show', scrollY > 700);
      let current = '';
      sections.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = s.id; });
      $$('.nav-links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
      ticking = false;
    }
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
    toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));

    // Hero glow follows the cursor
    const hero = $('#hero'), glow = $('#heroGlow');
    if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        glow.style.setProperty('--mx', `${e.clientX - r.left}px`);
        glow.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    }

    $('#year').textContent = new Date().getFullYear();
  }

  /* ---------- Visit counter (once per browser session) ---------- */
  function trackVisit() {
    try {
      if (sessionStorage.getItem('visited')) return;
      sessionStorage.setItem('visited', '1');
    } catch (e) { /* storage blocked — count anyway */ }
    fetch('/api/visit', { method: 'POST' }).catch(() => {});
  }

  /* ---------- Boot ---------- */
  setupChrome();
  setupForm();
  observeReveals();
  trackVisit();

  load()
    .then((data) => {
      bindSettings(data.settings);
      startTyped(data.settings.roles);
      renderStats(data);
      renderSkills(data.skills);
      ALL_PROJECTS = data.projects;
      renderFilters();
      renderProjects();
      renderContactLinks(data.settings);
      observeReveals();
    })
    .catch(() => {
      const err = h('div', { class: 'boot-error', text: 'Could not load content. Please refresh the page.' });
      $('#about .wrap').prepend(err);
    });
})();
