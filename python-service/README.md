# Python FastAPI Service

This service exposes simple endpoints used by the Next.js backend to:

- Score keywords using sentence-transformers embeddings: `/generate/keywords`
- Generate a post title/body: `/generate/post`
- Generate persona-aware comments: `/generate/comment`

Quickstart

```bash
cd python-service
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Environment

- `OPENAI_API_KEY` (optional) — when present, the service will call OpenAI GPT-4 for higher-quality text outputs. Otherwise it falls back to templates.

Docker

Build and run:

```bash
docker build -t python-service .
docker run -p 8000:8000 python-service
```
