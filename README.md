# Preet Patel — Portfolio (full stack)

Express + SQLite backend, vanilla HTML/CSS/JS frontend, and a built-in admin panel.

## Run it

```bash
npm install
ADMIN_PASSWORD="choose-a-strong-password" npm start
```

Windows (PowerShell):

```powershell
$env:ADMIN_PASSWORD="choose-a-strong-password"; npm start
```

- Site:  http://localhost:3000
- Admin: http://localhost:3000/admin

If `ADMIN_PASSWORD` is not set, the password defaults to `admin123` (change it before deploying).
Requires Node 18+.

## What's in the box

| Feature | Details |
|---|---|
| Database | SQLite file at `data/portfolio.db`, created and seeded on first run |
| Content | Profile text, skills and projects are loaded from the database via `GET /api/site` |
| Contact form | `POST /api/contact` — validated, rate-limited (5/hour per IP), honeypot spam trap; messages saved to the DB |
| Admin panel | Dashboard + visit chart, read/reply/delete messages, add/edit/delete projects and skills, edit all profile text and links |
| Auth | bcrypt-checked password, random session token in an httpOnly, SameSite=Strict cookie (12 h), login rate limit |
| Frontend | Dark/light theme (remembered), typed role line, scroll reveal, animated skill bars, project filters, mobile menu, scroll progress |
| Security | Helmet with a strict Content-Security-Policy, no inline scripts/styles, all API data rendered via textContent |

## Files

```
server.js          Express app + REST API
db.js              SQLite schema and seed data
public/index.html  Portfolio page
public/css/        style.css
public/js/         main.js, theme.js
public/admin/      Admin panel (index.html, admin.css, admin.js)
data/              Database lives here (git-ignored)
```

## Deploying

Any host that runs Node works (Render, Railway, Fly.io, a VPS). Set NODE_ENV=production,
ADMIN_PASSWORD, and optionally PORT. Put the data/ folder on a persistent disk
(or set DATA_DIR) so your database survives restarts.
