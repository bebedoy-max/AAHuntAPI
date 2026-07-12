# CreditHunter — API Server

Express + Drizzle ORM backend for the Free Credits Dashboard.

## Deploy to Railway (5 menit)

### 1. Buat project baru di Railway
Buka [railway.app](https://railway.app) → New Project → Deploy from local repo  
*(atau upload via GitHub)*

### 2. Tambah PostgreSQL
Di dalam project → Add Plugin → PostgreSQL  
Railway akan otomatis mengisi `DATABASE_URL` ke semua service.

### 3. Set Environment Variables
Di Railway → project → Variables, tambah:
```
GEMINI_API_KEY=AIza...
NODE_ENV=production
```
`DATABASE_URL` dan `PORT` sudah otomatis diisi Railway.

### 4. Push schema database
Setelah deploy pertama selesai, buka Railway Shell dan jalankan:
```bash
npm run db:push
```

### 5. Salin URL backend
Railway akan memberikan URL seperti:  
`https://credithunter-api-production.up.railway.app`

### 6. Set di Vercel (frontend)
Di Vercel → project → Settings → Environment Variables:
```
VITE_API_BASE_URL=https://credithunter-api-production.up.railway.app
```
Lalu redeploy frontend.

## Endpoints

| Method | Path | Keterangan |
|--------|------|-----------|
| GET | /api/healthz | Health check |
| GET | /api/providers | List semua AI providers |
| GET | /api/providers/summary | Statistik dashboard |
| GET | /api/api-keys | List API keys yang disimpan |
| POST | /api/api-keys | Tambah API key baru |
| POST | /api/research/trigger | Jalankan research job |
| GET | /api/research/status | Status research terakhir |
| GET | /api/codes | List promo codes |
| POST | /api/codes/research | Cari promo codes via AI |

## Local Development

```bash
npm install
cp .env.example .env
# isi DATABASE_URL dan GEMINI_API_KEY di .env
npm run db:push
npm run build
npm run start
```
