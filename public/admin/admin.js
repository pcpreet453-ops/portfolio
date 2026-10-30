(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

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

  /* ---------- API helper ---------- */
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('Session expired. Please sign in again.'); }
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }

  let toastTimer;
  function toast(text, bad) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.toggle('bad', !!bad);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const fmtDate = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  /* ---------- Views ---------- */
  function showLogin() { $('#appView').hidden = true; $('#loginView').hidden = false; $('#pw').focus(); }
  function showApp() { $('#loginView').hidden = true; $('#appView').hidden = false; refreshAll(); }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      await api('POST', '/api/admin/login', { password: $('#pw').value });
      $('#pw').value = '';
      showApp();
    } catch (err) { $('#loginErr').textContent = err.message; }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('POST', '/api/admin/logout'); } catch (e) { /* ignore */ }
    showLogin();
  });

  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });

  /* ---------- Tabs ---------- */
  function openTab(name) {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach((p) => (p.hidden = p.id !== `tab-${name}`));
    location.hash = name;
  }
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

  /* ---------- Dashboard ---------- */
  async function loadStats() {
    const s = await api('GET', '/api/admin/stats');
    const root = $('#statCards');
    root.textContent = '';
    [
      [s.visitsToday, 'Visits today'], [s.visitsTotal, 'Total visits'],
      [s.messages, 'Messages'], [s.unread, 'Unread'],
      [s.projects, 'Projects'], [s.skills, 'Skills'],
    ].forEach(([n, l]) => root.append(h('div', { class: 'card' }, h('b', { text: String(n) }), h('span', { text: l }))));

    const pill = $('#unreadPill');
    pill.hidden = s.unread === 0;
    pill.textContent = s.unread;

    // Fill in the last 14 days, including days with zero visits
    const map = new Map(s.visits.map((v) => [v.day, v.count]));
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: String(d.getDate()), count: map.get(key) || 0 });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    const chart = $('#visitChart');
    chart.textContent = '';
    days.forEach((d) => {
      const bar = h('i', { title: `${d.key}: ${d.count} visit${d.count === 1 ? '' : 's'}` });
      bar.style.height = `${Math.max(2, (d.count / max) * 100)}%`;
      chart.append(h('div', { class: 'col' }, bar, h('small', { text: d.label })));
    });
  }

  /* ---------- Messages ---------- */
  async function loadMessages() {
    const list = await api('GET', '/api/admin/messages');
    const root = $('#messageList');
    root.textContent = '';
    if (!list.length) { root.append(h('p', { class: 'empty-state', text: 'No messages yet. They will show up here when someone uses your contact form.' })); return; }
    list.forEach((m) => {
      const subject = m.subject ? `Re: ${m.subject}` : 'Your message';
      root.append(h('div', { class: `row${m.is_read ? '' : ' unread'}` },
        h('div', {},
          h('h4', { text: m.name }),
          h('p', { text: m.email }),
          m.subject ? h('p', { text: m.subject }) : null,
          h('div', { class: 'body', text: m.body }),
          h('div', { class: 'meta', text: fmtDate(m.created_at) })
        ),
        h('div', { class: 'actions' },
          h('a', { class: 'mini', href: `mailto:${m.email}?subject=${encodeURIComponent(subject)}`, text: 'Reply' }),
          h('button', { class: 'mini', type: 'button', text: m.is_read ? 'Mark unread' : 'Mark read', onclick: async () => {
            try { await api('PATCH', `/api/admin/messages/${m.id}`, { is_read: !m.is_read }); await Promise.all([loadMessages(), loadStats()]); } catch (e) { toast(e.message, true); }
          } }),
          h('button', { class: 'mini danger', type: 'button', text: 'Delete', onclick: async () => {
            if (!confirm('Delete this message permanently?')) return;
            try { await api('DELETE', `/api/admin/messages/${m.id}`); toast('Message deleted'); await Promise.all([loadMessages(), loadStats()]); } catch (e) { toast(e.message, true); }
          } })
        )
      ));
    });
  }

  /* ---------- Projects ---------- */
  const pForm = $('#projectForm');
  let projects = [];

  async function loadProjects() {
    projects = (await api('GET', '/api/site')).projects;
    const root = $('#projectList');
    root.textContent = '';
    if (!projects.length) { root.append(h('p', { class: 'empty-state', text: 'No projects yet — add your first one.' })); return; }
    projects.forEach((p) => {
      root.append(h('div', { class: 'row' },
        h('div', {},
          h('h4', {}, h('span', { text: p.title }), p.featured ? h('span', { class: 'badge', text: 'Featured' }) : null),
          h('p', { text: p.description }),
          h('div', { class: 'meta', text: p.tags.join(' · ') })
        ),
        h('div', { class: 'actions' },
          h('button', { class: 'mini', type: 'button', text: 'Edit', onclick: () => editProject(p) }),
          h('button', { class: 'mini danger', type: 'button', text: 'Delete', onclick: async () => {
            if (!confirm(`Delete “${p.title}”?`)) return;
            try { await api('DELETE', `/api/admin/projects/${p.id}`); toast('Project deleted'); await Promise.all([loadProjects(), loadStats()]); } catch (e) { toast(e.message, true); }
          } })
        )
      ));
    });
  }

  function editProject(p) {
    pForm.reset();
    $('#projectErr').textContent = '';
    pForm.elements.id.value = p ? p.id : '';
    if (p) {
      pForm.elements.title.value = p.title;
      pForm.elements.description.value = p.description;
      pForm.elements.tags.value = p.tags.join(', ');
      pForm.elements.live_url.value = p.live_url;
      pForm.elements.repo_url.value = p.repo_url;
      pForm.elements.featured.checked = p.featured;
    }
    pForm.hidden = false;
    pForm.elements.title.focus();
    pForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#newProject').addEventListener('click', () => editProject(null));
  $('#cancelProject').addEventListener('click', () => { pForm.hidden = true; });

  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#projectErr').textContent = '';
    const f = pForm.elements;
    const body = {
      title: f.title.value, description: f.description.value, tags: f.tags.value,
      live_url: f.live_url.value, repo_url: f.repo_url.value, featured: f.featured.checked,
    };
    try {
      if (f.id.value) await api('PUT', `/api/admin/projects/${f.id.value}`, body);
      else await api('POST', '/api/admin/projects', body);
      pForm.hidden = true;
      toast('Project saved');
      await Promise.all([loadProjects(), loadStats()]);
    } catch (err) { $('#projectErr').textContent = err.message; }
  });

  /* ---------- Skills ---------- */
  const sForm = $('#skillForm');
  $('#sLevel').addEventListener('input', (e) => { $('#sLevelVal').textContent = e.target.value; });

  function resetSkillForm() {
    sForm.reset();
    sForm.elements.id.value = '';
    $('#sLevelVal').textContent = '80';
    $('#skillSave').textContent = 'Add skill';
    $('#skillCancel').hidden = true;
  }
  $('#skillCancel').addEventListener('click', resetSkillForm);

  async function loadSkills() {
    const skills = (await api('GET', '/api/site')).skills;
    const root = $('#skillList');
    root.textContent = '';
    const cats = [...new Set(skills.map((s) => s.category))];
    const dl = $('#catList');
    dl.textContent = '';
    cats.forEach((c) => dl.append(h('option', { value: c })));

    if (!skills.length) { root.append(h('p', { class: 'empty-state', text: 'No skills yet.' })); return; }
    cats.forEach((cat) => {
      root.append(h('h3', { class: 'cat-title', text: cat }));
      skills.filter((s) => s.category === cat).forEach((s) => {
        root.append(h('div', { class: 'row' },
          h('div', {}, h('h4', { text: s.name }), h('div', { class: 'meta', text: `Level ${s.level}` })),
          h('div', { class: 'actions' },
            h('button', { class: 'mini', type: 'button', text: 'Edit', onclick: () => {
              sForm.elements.id.value = s.id;
              sForm.elements.name.value = s.name;
              sForm.elements.category.value = s.category;
              sForm.elements.level.value = s.level;
              $('#sLevelVal').textContent = s.level;
              $('#skillSave').textContent = 'Update skill';
              $('#skillCancel').hidden = false;
              sForm.elements.name.focus();
              sForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } }),
            h('button', { class: 'mini danger', type: 'button', text: 'Delete', onclick: async () => {
              if (!confirm(`Delete “${s.name}”?`)) return;
              try { await api('DELETE', `/api/admin/skills/${s.id}`); toast('Skill deleted'); await Promise.all([loadSkills(), loadStats()]); } catch (e) { toast(e.message, true); }
            } })
          )
        ));
      });
    });
  }

  sForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = sForm.elements;
    const body = { name: f.name.value, category: f.category.value, level: f.level.value };
    try {
      if (f.id.value) await api('PUT', `/api/admin/skills/${f.id.value}`, body);
      else await api('POST', '/api/admin/skills', body);
      toast(f.id.value ? 'Skill updated' : 'Skill added');
      resetSkillForm();
      await Promise.all([loadSkills(), loadStats()]);
    } catch (err) { toast(err.message, true); }
  });

  /* ---------- Profile ---------- */
  const profForm = $('#profileForm');
  async function loadProfile() {
    const s = (await api('GET', '/api/site')).settings;
    Array.from(profForm.elements).forEach((el) => { if (el.name && s[el.name] != null) el.value = s[el.name]; });
  }
  profForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#profileErr').textContent = '';
    const body = {};
    Array.from(profForm.elements).forEach((el) => { if (el.name) body[el.name] = el.value; });
    try { await api('PUT', '/api/admin/settings', body); toast('Profile saved — refresh the site to see it'); }
    catch (err) { $('#profileErr').textContent = err.message; }
  });

  /* ---------- Boot ---------- */
  function refreshAll() {
    Promise.all([loadStats(), loadMessages(), loadProjects(), loadSkills(), loadProfile()]).catch((e) => toast(e.message, true));
    const tab = (location.hash || '#dash').slice(1);
    openTab($(`#tabs [data-tab="${tab}"]`) ? tab : 'dash');
  }

  api('GET', '/api/admin/me').then(showApp).catch(showLogin);
})();
