# Supabase Setup (Replacing D1)

This repo now includes a Postgres-backed API server in `apps/server` that is intended to run against Supabase Postgres.

## 1) Create Supabase Project

Create a new project in Supabase and note:

- Database password (for the `postgres` user)
- Project ref (for the connection hostname)

## 2) Get `DATABASE_URL`

From Supabase project settings, copy the Postgres connection string and use it as:

- `DATABASE_URL`

Example shape:

```text
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

## 3) Run Migrations

```bash
DATABASE_URL=... npm run db:migrate --workspace @grammar/server
```

## 4) Seed Cards

```bash
DATABASE_URL=... npm run db:seed --workspace @grammar/server
```

## 5) Run Locally

Terminal A (API server on `:8787`):

```bash
cd apps/server
cp .env.example .env
# edit DATABASE_URL + SESSION_SECRET
npm run dev
```

Terminal B (web on `:5173`):

```bash
VITE_API_BASE_URL=http://localhost:8787 npm run dev --workspace @grammar/web
```

