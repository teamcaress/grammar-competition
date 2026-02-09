# Render Deployment (Supabase + Web UI + API)

This repo can deploy to Render as a single web service that serves:

- API: `/api/*` from `apps/server`
- Frontend SPA: static build from `apps/web/dist`

## Render Setup

1. Create a new **Web Service** on Render from this GitHub repo.
2. Render will detect `render.yaml` at repo root and apply the blueprint.
3. Set the required environment variables in Render:

- `DATABASE_URL` (Supabase Postgres connection string)
- `SESSION_SECRET` (random secret, 32+ chars)

Optional:

- `ALLOWED_ORIGIN` only if your frontend is hosted on a different origin than the API.

## Migrations

Render build nodes can fail to reach Supabase (often IPv6 routing issues), so the blueprint does **not** run migrations during the build.

Run migrations from your local machine:

```bash
DATABASE_URL=... npm run db:migrate --workspace @grammar/server
```

Or paste the SQL from:

- `apps/server/migrations/0001_init.sql`
- `apps/server/migrations/0002_users_room_display_name_unique.sql`

into the Supabase SQL editor and run it once.

## Supabase `DATABASE_URL`

Use the full connection string from Supabase.

If you are constructing it from components, the shape is:

```text
postgresql://postgres:<PASSWORD>@db.<project-ref>.supabase.co:5432/postgres
```

## One-Time Seed

After the first deploy (once migrations have run), seed cards from your local machine:

```bash
DATABASE_URL=... npm run db:seed --workspace @grammar/server
```
