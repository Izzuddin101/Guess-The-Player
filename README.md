# Guess the Player

A five-round League of Legends guessing game for a private group of friends. Each round starts
with anonymized result, duration, and K/D/A evidence; wrong guesses progressively
unlock stronger clues while the backend keeps the answer and Riot identifiers
private.

## Project layout

```text
apps/frontend/   React, TypeScript, Vite, Tailwind CSS, TanStack Query
apps/backend/    FastAPI, HTTPX, Pydantic, Pytest
config/          Manually managed friend list
render.yaml      Render Blueprint for both services
```

## Configure players

Copy `config/players.example.json` to `config/players.json`, then replace every
example with a real friend:

```json
{
  "id": "stable-public-id",
  "displayName": "Name shown in choices",
  "gameName": "Exact Riot game name",
  "tagLine": "Exact tag",
  "platformRegion": "euw1",
  "regionalRoute": "europe"
}
```

Configure 4–10 players. The regional route is one of `americas`, `asia`, `europe`, or
`sea`. The Riot API key only belongs in the backend environment.

## Run locally

Backend (Python 3.11+ with [uv](https://docs.astral.sh/uv/)):

```bash
cd apps/backend
uv run uvicorn app.main:app --reload
```

Frontend (Node 20.19+ with pnpm):

```bash
cd apps/frontend
pnpm install
pnpm dev
```

The app is at `http://localhost:5173`; API docs are at
`http://localhost:8000/docs`. Local development reads `RIOT_API_KEY` from the
repository root `.env`, and Vite proxies `/api` requests to port 8000.

## Test

```bash
cd apps/backend && uv run pytest
cd apps/frontend && pnpm test
cd apps/frontend && pnpm build
```

Backend tests use mocked Riot responses and require no API key.

## Deploy to Render

Create a Blueprint from `render.yaml`, then set:

- `RIOT_API_KEY` on the web service.
- `FRONTEND_ORIGIN` on the web service to the exact static-site URL.
- `VITE_API_BASE_URL` on the static site to the exact web-service URL.

Keep the Render copy at `apps/backend/players.json` in sync when changing the
local `config/players.json`. The backend service uses the copy inside its Render
root directory. Render builds the frontend as a Static Site and starts the
backend with Uvicorn as a Web Service.

## API

```text
GET  /api/v1/health
GET  /api/v1/players
POST /api/v1/rounds
POST /api/v1/rounds/{round_id}/guess
POST /api/v1/rounds/{round_id}/skip
```

Rounds expire after ten minutes. Each wrong guess unlocks the next clue stage;
stage scores are 1,000, 700, 400, and 200 points. A fourth miss or skip completes
the round. Active rounds and caches live in process memory, so deploying multiple
backend instances is outside this MVP’s scope.
