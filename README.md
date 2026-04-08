# COINVERSE SMP Monorepo

Production-ready monorepo for:
- Minecraft plugin integration (CoinverseCore API sync)
- Backend API on Render
- Frontend dashboard on Cloudflare Pages

## Structure

- `backend/` Express API + JSON persistence
- `frontend/` Static dashboard (HTML/CSS/JS)
- `.github/workflows/` CI + deploy automation

## 1) Local Setup

### Backend

```bash
cd backend
npm install
node server.js
```

Backend runs on:
- `http://localhost:3000`

Environment variables:
- `PORT=3000`
- `API_KEY=12341`

You can copy:
- `backend/.env.example`

### Frontend

Serve static files from any simple static server or open `frontend/index.html` directly.
Recommended for local testing:

```bash
cd frontend
python -m http.server 8080
```

Open:
- `http://localhost:8080`

## 2) GitHub Push Steps

```bash
git init
git add .
git commit -m "coinverse monorepo"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## 3) Render Deploy Steps (Backend)

1. Create new **Web Service** in Render.
2. Connect your GitHub repo.
3. Set Root Directory to: `backend`
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Add environment variable:
   - `API_KEY=12341`
7. Deploy.

Backend URL will look like:
- `https://your-service-name.onrender.com`

## 4) Cloudflare Pages Deploy Steps (Frontend)

1. In Cloudflare Pages, create project named:
   - `coinverse-smp-dashboard`
2. Connect same GitHub repo.
3. Build command: *(leave empty)*
4. Build output directory: `frontend`
5. In GitHub repo secrets, set:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
6. Push to `main` branch.

Workflow `cloudflare.yml` will auto-deploy frontend.

## 5) Plugin Config Setup (CoinverseCore)

In plugin `config.yml`:

```yml
backend:
  enabled: true
  base-url: "https://your-service-name.onrender.com"
  api-key: "12341"
```

Plugin uses these backend endpoints:
- `POST /player/register`
- `POST /player/update`
- `GET /player/:username`

Dashboard uses admin endpoints:
- `GET /admin/players`
- `POST /admin/approve`

## Security Notes

- API key is validated via `x-api-key` middleware.
- No deployment secrets are hardcoded in code.
- Use Render/Cloudflare/GitHub secrets for production.
