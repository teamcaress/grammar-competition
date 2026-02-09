# Cloudflare Deploy Runbook

This project deploys as:
- Frontend: Cloudflare Pages (`apps/web`)
- API: Cloudflare Workers + D1 (`apps/api`)

## 1) Auth

Option A (interactive):

```bash
WRANGLER_HOME=/Users/nealcaren/Documents/GitHub/grammar-competition/.wrangler-home npx wrangler login
```

Option B (recommended for CI): set env vars before deploy:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## 2) Create D1 Databases

```bash
WRANGLER_HOME=/Users/nealcaren/Documents/GitHub/grammar-competition/.wrangler-home npx wrangler d1 create grammar_trainer_dev
WRANGLER_HOME=/Users/nealcaren/Documents/GitHub/grammar-competition/.wrangler-home npx wrangler d1 create grammar_trainer_prod
```

Copy returned `database_id` values into:

- `apps/api/wrangler.toml` (`REPLACE_WITH_DEV_DATABASE_ID`, `REPLACE_WITH_PROD_DATABASE_ID`)

## 3) Apply Migrations

```bash
npm run db:migrate:remote --workspace @grammar/api
```

## 4) Deploy Worker API

```bash
npm run deploy:dev --workspace @grammar/api
npm run deploy:prod --workspace @grammar/api
```

## 5) Deploy Pages Frontend

Build:

```bash
npm run build --workspace @grammar/web
```

Deploy Pages project from `apps/web/dist` (Cloudflare dashboard or Wrangler Pages deploy flow).

Set Pages environment variable:

- `VITE_API_BASE_URL` -> the deployed Worker URL for each environment.

## 6) Post-Deploy Smoke Checks

```bash
curl -i https://<worker-url>/api/health
curl -i https://<worker-url>/api/db-check
```

Then verify app flow manually:
- login
- start session
- answer card
- dashboard metrics
- leaderboard tabs

## 7) GitHub Actions Automation (API)

Workflow file:

- `.github/workflows/deploy-api.yml`

Behavior:

- Push to `main` (when API files change): deploys `dev`
- Manual run (`workflow_dispatch`): choose `dev` or `production`

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CF_SESSION_SECRET_DEV`
- `CF_SESSION_SECRET_PROD`

Recommended setup:

- Configure a GitHub `production` Environment with required reviewers.
- The workflow already targets this environment for production deploys.
