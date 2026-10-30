'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'portfolio.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '',
  live_url    TEXT NOT NULL DEFAULT '',
  repo_url    TEXT NOT NULL DEFAULT '',
  featured    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'Other',
  level      INTEGER NOT NULL DEFAULT 80,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  day   TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
`);

/* ---------- Seed data (only on a fresh database) ---------- */
const DEFAULT_SETTINGS = {
  full_name: 'Patel Preet Ashokkumar',
  short_name: 'Preet Patel',
  headline: 'Full Stack & Software Developer',
  subheadline: 'AI & Cloud Computing',
  location: 'Ahmedabad, Gujarat',
  year_label: '2026',
  about_lede:
    "I build clean, functional software across the stack — and I'm always chasing the point where good engineering meets applied AI.",
  about_1:
    "I'm Preet Patel, a full stack & software developer based in Ahmedabad, Gujarat. I enjoy working across the entire product lifecycle — from designing APIs and data models to shipping polished, responsive interfaces.",
  about_2:
    "Lately I've been going deep on AI-assisted development and how modern web tooling can help small teams move faster without cutting corners on quality.",
  focus: 'Full Stack Development',
  interest: 'AI & Web Technologies',
  status: 'Open to opportunities',
  email: 'your.email@example.com',
  github: 'https://github.com/yourusername',
  linkedin: 'https://linkedin.com/in/yourusername',
  roles: 'Full Stack Developer|Software Engineer|AI Enthusiast|Cloud Learner',
};

const seedSettings = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) seedSettings.run(k, v);

if (db.prepare('SELECT COUNT(*) AS c FROM projects').get().c === 0) {
  const ins = db.prepare(
    'INSERT INTO projects (title, description, tags, live_url, repo_url, featured, sort_order) VALUES (?,?,?,?,?,?,?)'
  );
  ins.run(
    'Project One',
    'Replace this with a short, concrete description of a real project — what it does, the problem it solves, and your role in building it.',
    'React,Node.js,MongoDB', '', '', 1, 1
  );
  ins.run(
    'Project Two',
    'Another project slot — swap in your title, a one or two line summary, and the live link or GitHub repo.',
    'Next.js,Python,API', '', '', 1, 2
  );
  ins.run(
    'Project Three',
    'A third slot for any AI-focused build, hackathon project, or freelance work worth showing off.',
    'AI/ML,TypeScript', '', '', 0, 3
  );
}

if (db.prepare('SELECT COUNT(*) AS c FROM skills').get().c === 0) {
  const ins = db.prepare('INSERT INTO skills (name, category, level, sort_order) VALUES (?,?,?,?)');
  const skills = [
    ['JavaScript', 'Languages', 90], ['TypeScript', 'Languages', 80], ['Python', 'Languages', 80], ['SQL', 'Languages', 78],
    ['React', 'Frontend', 88], ['Next.js', 'Frontend', 80], ['TailwindCSS', 'Frontend', 85],
    ['Node.js', 'Backend', 85], ['Express', 'Backend', 85], ['MongoDB', 'Backend', 78], ['REST APIs', 'Backend', 88],
    ['Git & GitHub', 'Tools', 88], ['Machine Learning', 'AI', 65], ['Prompt Engineering', 'AI', 82],
  ];
  skills.forEach((s, i) => ins.run(s[0], s[1], s[2], i + 1));
}

module.exports = db;
