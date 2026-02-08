# SAT/ACT Grammar Trainer

Phone-first SAT/ACT grammar practice app with spaced repetition and leaderboard support.

## Repo Layout

- `apps/web`: Cloudflare Pages frontend (React + Tailwind + Vite)
- `apps/api`: Cloudflare Worker API + D1 bindings
- `apps/api/migrations`: D1 SQL migrations
- `docs`: product and data contracts
- `content/schemas`: JSON schema for card imports
- `datasets`: local card datasets for validation/import
- `scripts`: utility scripts

## Prerequisites

- Node.js 20+
- npm 10+
- Wrangler CLI (`npm i -D wrangler` at root or global install)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template for local Worker vars:

```bash
cp .dev.vars.example .dev.vars
```

3. Create D1 DB (once) and update IDs in `apps/api/wrangler.toml`.
   - Replace `REPLACE_WITH_DEV_DATABASE_ID` and `REPLACE_WITH_PROD_DATABASE_ID`.
   - Keep `database_name` values aligned with the actual D1 databases.

4. Apply migrations locally:

```bash
npm run db:migrate --workspace @grammar/api
```

## Development

Run frontend + API together:

```bash
npm run dev
```

API quick checks:

```bash
curl -i http://localhost:8787/api/health
curl -i http://localhost:8787/api/db-check
```

Login payload shape:

```json
{
  "room_code": "ROOM123",
  "display_name": "Alex"
}
```

Authenticated endpoint examples:

- `GET /api/me`
- `GET /api/dashboard`
- `GET /api/leaderboard?range=today|week|all`
- `POST /api/session/start` with optional body:

```json
{
  "unit_id": "Sentence Boundaries",
  "size": 15
}
```

- `POST /api/session/answer` body:

```json
{
  "card_id": "card_123",
  "choice": "B",
  "response_ms": 4200
}
```

Useful single-service commands:

```bash
npm run dev:web
npm run dev:api
```

## Card Contract Validation

Validate normalized JSON dataset:

```bash
npm run validate:cards -- datasets/cards.sample.json
```

Get a quick coverage report:

```bash
npm run report:cards -- datasets/cards.seed.v1.json
```

Merge seed sets into a master file:

```bash
npm run merge:cards -- datasets/cards.seed.v1.json datasets/cards.seed.act.v1.json datasets/cards.variations.v1.json
mv datasets/cards.seed.master.v1.json datasets/cards.seed.master.v2.json
```

Run blueprint gap checks:

```bash
npm run check:blueprint -- datasets/cards.seed.master.v2.json
```

Contract docs:

- `docs/card-import-contract.md`
- `docs/satact-content-blueprint.md`
- `docs/act-prep-carding-guide.md`
- `content/schemas/grammar-card.schema.json`

Current seed datasets:

- `datasets/cards.seed.v1.json`
- `datasets/cards.seed.act.v1.json`
- `datasets/cards.variations.v1.json`
- `datasets/cards.seed.master.v2.json`
