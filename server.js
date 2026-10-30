'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const SESSION_HOURS = 12;
const COOKIE_NAME = 'pp_admin';
const IS_PROD = process.env.NODE_ENV === 'production';

/* ---------- Admin password ---------- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('\n[!] ADMIN_PASSWORD not set — using the default "admin123".');
  console.warn('    Set it before going live:  ADMIN_PASSWORD="something-strong" npm start\n');
}
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: '50kb' }));

/* ---------- Helpers ---------- */
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isUrlOrEmpty = (v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v);

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function requireAdmin(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) {
    const row = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token);
    if (row && row.expires_at > Date.now()) return next();
    if (row) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.status(401).json({ error: 'Not authorised' });
}

const getSettings = () => {
  const out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach((r) => (out[r.key] = r.value));
  return out;
};

const shapeProject = (p) => ({
  ...p,
  featured: !!p.featured,
  tags: p.tags ? p.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
});

/* ---------- Rate limiters ---------- */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages from this address. Please try again later.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

/* =====================================================
   PUBLIC API
   ===================================================== */
app.get('/api/site', (req, res) => {
  const settings = getSettings();
  const projects = db.prepare('SELECT * FROM projects ORDER BY sort_order, id').all().map(shapeProject);
  const skills = db.prepare('SELECT * FROM skills ORDER BY sort_order, id').all();
  res.json({ settings, projects, skills });
});

app.post('/api/visit', (req, res) => {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare(
    'INSERT INTO visits (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1'
  ).run(day);
  res.json({ ok: true });
});

app.post('/api/contact', contactLimiter, (req, res) => {
  const { name, email, subject, message, website } = req.body || {};
  // Honeypot: bots fill the hidden "website" field. Pretend success.
  if (website) return res.json({ ok: true });

  const n = clean(name, 100);
  const e = clean(email, 200);
  const s = clean(subject, 150);
  const m = clean(message, 3000);

  const errors = {};
  if (n.length < 2) errors.name = 'Please enter your name.';
  if (!isEmail(e)) errors.email = 'Please enter a valid email address.';
  if (m.length < 10) errors.message = 'Message should be at least 10 characters.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', errors });

  db.prepare('INSERT INTO messages (name, email, subject, body, ip) VALUES (?,?,?,?,?)').run(n, e, s, m, req.ip || '');
  res.json({ ok: true });
});

/* =====================================================
   ADMIN API
   ===================================================== */
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const pw = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!bcrypt.compareSync(pw, ADMIN_HASH)) return res.status(401).json({ error: 'Incorrect password.' });

  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  db.prepare('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, expires);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD,
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true }));

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  const last14 = db
    .prepare("SELECT day, count FROM visits WHERE day >= date('now','-13 days') ORDER BY day")
    .all();
  res.json({
    messages: one('SELECT COUNT(*) AS c FROM messages'),
    unread: one('SELECT COUNT(*) AS c FROM messages WHERE is_read = 0'),
    projects: one('SELECT COUNT(*) AS c FROM projects'),
    skills: one('SELECT COUNT(*) AS c FROM skills'),
    visitsTotal: one('SELECT COALESCE(SUM(count),0) AS c FROM visits'),
    visitsToday: one("SELECT COALESCE(SUM(count),0) AS c FROM visits WHERE day = date('now')"),
    visits: last14,
  });
});

/* ----- Messages ----- */
app.get('/api/admin/messages', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC').all().map((m) => ({ ...m, is_read: !!m.is_read })));
});
app.patch('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const read = req.body?.is_read ? 1 : 0;
  const r = db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(read, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ----- Projects ----- */
function readProject(body) {
  const title = clean(body?.title, 120);
  const description = clean(body?.description, 800);
  const tags = (Array.isArray(body?.tags) ? body.tags : clean(body?.tags, 300).split(','))
    .map((t) => String(t).trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 10)
    .join(',');
  const live_url = clean(body?.live_url, 300);
  const repo_url = clean(body?.repo_url, 300);
  const errors = {};
  if (!title) errors.title = 'Title is required.';
  if (!description) errors.description = 'Description is required.';
  if (!isUrlOrEmpty(live_url)) errors.live_url = 'Must start with http:// or https://';
  if (!isUrlOrEmpty(repo_url)) errors.repo_url = 'Must start with http:// or https://';
  return { errors, value: { title, description, tags, live_url, repo_url, featured: body?.featured ? 1 : 0 } };
}

app.post('/api/admin/projects', requireAdmin, (req, res) => {
  const { errors, value } = readProject(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });
  const next = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM projects').get().n;
  const r = db
    .prepare(
      'INSERT INTO projects (title, description, tags, live_url, repo_url, featured, sort_order) VALUES (?,?,?,?,?,?,?)'
    )
    .run(value.title, value.description, value.tags, value.live_url, value.repo_url, value.featured, next);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.put('/api/admin/projects/:id', requireAdmin, (req, res) => {
  const { errors, value } = readProject(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0], errors });
  const r = db
    .prepare(
      'UPDATE projects SET title=?, description=?, tags=?, live_url=?, repo_url=?, featured=? WHERE id=?'
    )
    .run(value.title, value.description, value.tags, value.live_url, value.repo_url, value.featured, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/admin/projects/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ----- Skills ----- */
function readSkill(body) {
  const name = clean(body?.name, 50);
  const category = clean(body?.category, 40) || 'Other';
  const level = Math.max(0, Math.min(100, parseInt(body?.level, 10) || 0));
  const errors = {};
  if (!name) errors.name = 'Skill name is required.';
  return { errors, value: { name, category, level } };
}
app.post('/api/admin/skills', requireAdmin, (req, res) => {
  const { errors, value } = readSkill(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0] });
  const next = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM skills').get().n;
  const r = db
    .prepare('INSERT INTO skills (name, category, level, sort_order) VALUES (?,?,?,?)')
    .run(value.name, value.category, value.level, next);
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.put('/api/admin/skills/:id', requireAdmin, (req, res) => {
  const { errors, value } = readSkill(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: Object.values(errors)[0] });
  const r = db
    .prepare('UPDATE skills SET name=?, category=?, level=? WHERE id=?')
    .run(value.name, value.category, value.level, req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
app.delete('/api/admin/skills/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM skills WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ----- Profile settings ----- */
const EDITABLE = {
  full_name: 120, short_name: 80, headline: 120, subheadline: 120, location: 120, year_label: 20,
  about_lede: 300, about_1: 700, about_2: 700, focus: 80, interest: 80, status: 80,
  email: 200, github: 300, linkedin: 300, roles: 300,
};
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  if (body.email && !isEmail(clean(body.email, 200))) return res.status(400).json({ error: 'Invalid email address.' });
  for (const k of ['github', 'linkedin']) {
    if (body[k] && !isUrlOrEmpty(clean(body[k], 300))) return res.status(400).json({ error: `${k} must be a full URL.` });
  }
  db.transaction(() => {
    for (const [k, max] of Object.entries(EDITABLE)) {
      if (typeof body[k] === 'string') upsert.run(k, clean(body[k], max));
    }
  })();
  res.json({ ok: true });
});

/* =====================================================
   STATIC + ROUTES
   ===================================================== */
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC, { extensions: ['html'], maxAge: IS_PROD ? '1h' : 0 }));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin', 'index.html')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`\n  Portfolio running  →  http://localhost:${PORT}`);
  console.log(`  Admin panel        →  http://localhost:${PORT}/admin\n`);
});
