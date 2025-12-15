# SlideForge Reddit Calendar System

End-to-end demo that auto-generates a weekly Reddit content calendar using:
- Next.js (App Router) + Tailwind for the UI and API orchestration
- Supabase/Postgres for persistence
- Python FastAPI + Ollama/OpenAI for LLM-generated posts/comments

## Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- Supabase project (free tier works)
- Optional: OpenAI API key; otherwise the Python service uses Ollama (default model `gemma:2b`)

## Environment (replace with your values)
Create `.env.local` in the repo root:
```
NEXT_PUBLIC_SUPABASE_URL=enter_your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=enter_your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=enter_your_Supabase_service_key
PYTHON_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=Enter_your_OpenAI_API_key_here_if_you_want_to_use_OpenAI
```
Sign up at supabase.com to obtain the URL/keys.

## Setup & Run (after cloning)
1) Install JS deps
```bash
npm install
```
2) Install Python deps
```bash
cd python-service
python -m venv .venv
.\.venv\Scripts\activate  # or source .venv/bin/activate on mac/linux
pip install -r requirements.txt
```
3) Run services (two terminals)
```bash
# terminal 1 (Next.js)
npm run dev

# terminal 2 (Python FastAPI)
cd python-service
uvicorn main:app --reload --port 8000
```
4) Apply Supabase schema
- Run the SQL in `supabase/migrations/0001_init.sql` via Supabase SQL editor or `supabase db push` if you use the CLI.

## How generation works
- Frontend button calls `POST /api/generate/start` → enqueues a background job.
- Backend job (`runGeneration`) fetches company/personas/keywords/subreddits from Supabase, randomly picks a subreddit, distributes personas across selected keywords/dates, and calls the Python service.
- Python service endpoints:
  - `/generate/keywords`: embedding-based keyword scoring (sentence-transformers).
  - `/generate/post`: title/body via OpenAI (if key present) or Ollama (default `gemma:2b`), cleaned text.
  - `/generate/comment`: persona-aware comments via the same LLM path.
- Comments rotate commenters per post to avoid repetition.
- Subreddits are chosen randomly from the company’s rows for each generation.
- Results are inserted into `calendar_posts` and `calendar_comments`; the UI then reloads to show new content.

## API surface (Next.js)
- `POST /api/generate/start` — enqueue generation job, returns `job_id`.
- `GET /api/generate/status?id=...` — poll job status.
- `GET /api/generate/result?id=...` — fetch job result when ready.
- `GET /api/calendar` — this week’s posts (enriched with subreddit name).
- `GET /api/post/[id]` — post detail with comments.

## File map
- `app/api/generate-calendar/route.ts` — core orchestration used by the job runner.
- `app/api/generate/start|status|result` — job orchestration endpoints.
- `components/GeneratingPage.tsx` — client overlay that triggers generation and reloads on completion.
- `python-service/main.py` — FastAPI LLM service (OpenAI/Ollama).
- `supabase/migrations/0001_init.sql` — schema for companies, personas, keywords, posts, comments, subreddits.

## Notes / behavior
- Default Ollama model is `gemma:2b` (override via `OLLAMA_MODEL` env in Python service).
- OpenAI model is configurable via `OPENAI_MODEL` (default `gpt-4o`) if `OPENAI_API_KEY` is set.
- Persona assignment is balanced across the requested posts; commenters are shuffled per post.
- Timestamps are randomized within the current week; comments thread alternates replies.

## Requirements (Python)
See `python-service/requirements.txt` (FastAPI, uvicorn, sentence-transformers, numpy, openai, requests, pydantic). Use a virtualenv when installing.
