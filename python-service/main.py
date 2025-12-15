from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from collections import defaultdict
import os
import numpy as np
import requests
import json
import re

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

try:
    import openai
except Exception:
    openai = None

MODEL_NAME = "all-MiniLM-L6-v2"

app = FastAPI(title="Python LLM Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class KeywordItem(BaseModel):
    keyword_id: str
    keyword_phrase: str


class KeywordsRequest(BaseModel):
    company_description: str
    keywords: List[KeywordItem]
    posts_per_week: int = 3


class PostReq(BaseModel):
    subreddit: str
    keyword_phrase: str
    persona_description: str
    company_description: str


class CommentReq(BaseModel):
    persona_description: str
    parent_text: str
    post_title: str
    post_body: str
    company_description: str


def load_embedding_model():
    if SentenceTransformer is None:
        return None
    try:
        model = SentenceTransformer(MODEL_NAME)
        return model
    except Exception:
        return None


EMBED_MODEL = load_embedding_model()


def embed_text(text: str):
    if EMBED_MODEL is None:
        # fallback: simple hash-derived vector
        vec = np.ones(384, dtype=float) * (hash(text) % 100) / 100.0
        return vec
    return EMBED_MODEL.encode([text])[0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)
    if np.linalg.norm(a) == 0 or np.linalg.norm(b) == 0:
        return 0.0
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def call_llm(system: str, user_prompt: str, max_tokens: int = 100) -> Optional[str]:
    """
    Try OpenAI (if configured), otherwise try a local Ollama server (OLLAMA_URL).
    Returns generated text or None on failure.
    """
    # Try OpenAI first
    try:
        print("➡️ call_llm called")
        key = os.environ.get("OPENAI_API_KEY")
        if key and openai is not None:
            try:
                openai.api_key = key
                resp = openai.ChatCompletion.create(
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=max_tokens,
                    temperature=0.8,
                )
                return resp.choices[0].message.content.strip()
            except Exception:
                # fall through to Ollama
                pass

        # Try Ollama HTTP server as configured by OLLAMA_URL (default localhost)
        ollama_url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
        try:
            # Ollama HTTP API: POST /api/generate with JSON body { model, prompt }
            url = ollama_url.rstrip("/") + "/api/generate"
            payload = {
                "model": os.environ.get("OLLAMA_MODEL", "gemma2:2b"),
                "prompt": f"{system}\n\n{user_prompt}",
                "max_tokens": max_tokens,
                "stream": False,
            }
            # Use stream=True to support Ollama streaming/NDJSON responses.
            # Allow slower model boot by separating connect/read timeouts.
            r = requests.post(url, json=payload, timeout=(20, 300), stream=False)
            r.raise_for_status()

            parts: List[str] = []

            content_type = r.headers.get("Content-Type", "")
            # If Ollama returned a standard JSON object, try to extract main text
            if "application/json" in content_type:
                try:
                    j = r.json()
                    if isinstance(j, dict):
                        if "result" in j and isinstance(j["result"], str):
                            return j["result"].strip()
                        if "text" in j and isinstance(j["text"], str):
                            return j["text"].strip()
                        if "output" in j and isinstance(j["output"], list) and j["output"]:
                            first = j["output"][0]
                            if isinstance(first, dict) and "content" in first:
                                return str(first["content"]).strip()
                    # fallback: return a JSON string
                    return json.dumps(j)[:10000]
                except Exception:
                    # fall through to streaming parsing
                    pass

            # Otherwise parse streaming NDJSON-ish output line-by-line
            for raw in r.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                line = raw.strip()
                if line.startswith("data:"):
                    line = line[len("data:"):].strip()
                try:
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        if "response" in obj and isinstance(obj["response"], str):
                            parts.append(obj["response"])
                        elif "text" in obj and isinstance(obj["text"], str):
                            parts.append(obj["text"])
                        elif "content" in obj and isinstance(obj["content"], str):
                            parts.append(obj["content"])
                        else:
                            parts.append(json.dumps(obj))
                    else:
                        parts.append(str(obj))
                except Exception:
                    parts.append(line)

            text = "".join(parts).strip()
            return text if text else None
        except Exception:
            return None
    except Exception as e:
        print("❌ LLM error:", str(e))
        return None
    
def clean_markdown_prefix(text: str) -> str:
    """Clean LLM-generated text for Reddit posts/comments."""
    if not text:
        return ""

    # Remove leading markdown like ## or **
    text = re.sub(r"^#+\s*", "", text)
    text = re.sub(r"^\*\*(.*?)\*\*", r"\1", text)

    # Remove emojis
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002700-\U000027BF"  # dingbats
        "\U0001F900-\U0001F9FF"  # supplemental symbols & pictographs
        "\U00002600-\U000026FF"  # miscellaneous symbols
        "]+",
        flags=re.UNICODE,
    )
    text = emoji_pattern.sub(r'', text)
    return text.strip()

persona_post_counts: Dict[str,int] = defaultdict(int)

@app.post("/generate/keywords")
def generate_keywords(req: KeywordsRequest):
    # compute embeddings
    company_vec = embed_text(req.company_description)
    results: List[Dict[str, Any]] = []
    for k in req.keywords:
        kv = embed_text(k.keyword_phrase)
        score = cosine(company_vec, kv)
        results.append({"keyword_id": k.keyword_id, "keyword_phrase": k.keyword_phrase, "score": score})

    # sort descending by score
    results.sort(key=lambda x: x["score"], reverse=True)
    selected = results[: max(1, req.posts_per_week)]
    return {"selected": selected}


@app.post("/generate/post")
def generate_post(req: PostReq, max_posts_per_persona: int = 2):
    # Try OpenAI first
    if persona_post_counts[req.persona_description] >= max_posts_per_persona:
        raise HTTPException(status_code=400, detail=f"Persona '{req.persona_description}' reached max posts ({max_posts_per_persona})")
    
    system = "You are a helpful assistant that writes Reddit-style content in a casual, curious, human tone. Avoid marketing language."
    user_prompt = (
        f"Generate a Reddit post title (max 12 words) for subreddit {req.subreddit} "
        f"based on the keyword '{req.keyword_phrase}'. Include the company naturally using this description: "
        f"'{req.company_description}'. Only return the title, nothing else."
    )
    title = call_llm(system, user_prompt, max_tokens=40)

    body_prompt = (
        f"Write a casual 1-2 sentence Reddit post about '{req.keyword_phrase}' for subreddit {req.subreddit}. "
        f"Persona: {req.persona_description}. Mention the company naturally using this description: "
        f"'{req.company_description}'. Only return the post body, keep it human and authentic."
    )
    body = call_llm(system, body_prompt, max_tokens=60)

    # Fallbacks
    if not title:
        # simple heuristic title
        title = f"Anyone tried {req.keyword_phrase} on {req.subreddit}?"
    # ensure <=12 words
    if len(title.split()) > 12:
        title = " ".join(title.split()[:12])

    if not body:
        body = f"I've been experimenting with {req.keyword_phrase} lately — curious how others on r/{req.subreddit} approach it. Any tips?"

    title = clean_markdown_prefix(title).strip()
    body = clean_markdown_prefix(body).strip()

    persona_post_counts[req.persona_description] += 1

    return {"title": title, "body": body}


@app.post("/generate/comment")
def generate_comment(req: CommentReq):
    system = "You are a Reddit persona that writes short, one-line, natural comments. Keep it casual and human. Avoid marketing language."
    user_prompt = (
        f"Reply as persona '{req.persona_description}'. Parent text: '{req.parent_text}'. "
        f"Post context: '{req.post_title}' - '{req.post_body}'. "
        f"Write a natural 1-line Reddit comment. "
        f"You may reference the company naturally using this description: '{req.company_description}'. "
        "Only return the comment text, keep it casual and human."
    )
    comment = call_llm(system, user_prompt, max_tokens=60)
    if not comment:
        # fallback: echo and add a question
        comment = f"Interesting — I might try that. How long did it take to see results?"
    # keep single line and one sentence
    comment = comment.replace("\n", " ").strip()
    if "." in comment:
        # keep up to first sentence
        comment = comment.split(".")[0] + "."
    
    comment = clean_markdown_prefix(comment)

    return {"comment_text": comment}


@app.get("/healthz")
def health():
    return {
        "ok": True,
        "embeddings": EMBED_MODEL is not None,
        "openai": bool(os.environ.get("OPENAI_API_KEY")),
        "ollama_url": os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"),
        "ollama_model": os.environ.get("OLLAMA_MODEL", "gemma2:2b"),
    }

# Replacement LLM wrapper to clean Ollama JSON responses and allow OPENAI_MODEL override.
# Existing references to call_llm will use this re-assignment.
def _call_llm_clean(system: str, user_prompt: str, max_tokens: int = 100) -> Optional[str]:
    try:
        key = os.environ.get("OPENAI_API_KEY")
        if key and openai is not None:
            try:
                openai.api_key = key
                openai_model = os.environ.get("OPENAI_MODEL", "gpt-4o")
                resp = openai.ChatCompletion.create(
                    model=openai_model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=max_tokens,
                    temperature=0.8,
                )
                return resp.choices[0].message.content.strip()
            except Exception:
                pass

        ollama_url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
        url = ollama_url.rstrip("/") + "/api/generate"
        payload = {
            "model": os.environ.get("OLLAMA_MODEL", "gemma2:2b"),
            "prompt": f"{system}\n\n{user_prompt}",
            "max_tokens": max_tokens,
            "stream": False,
        }
        r = requests.post(url, json=payload, timeout=(20, 300), stream=False)
        r.raise_for_status()

        try:
            j = r.json()
            if isinstance(j, dict):
                if isinstance(j.get("response"), str):
                    return j["response"].strip().strip('"')
                if isinstance(j.get("result"), str):
                    return j["result"].strip().strip('"')
                if isinstance(j.get("text"), str):
                    return j["text"].strip().strip('"')
                if isinstance(j.get("output"), list) and j["output"]:
                    first = j["output"][0]
                    if isinstance(first, dict) and "content" in first:
                        return str(first["content"]).strip().strip('"')
            return None
        except Exception:
            return None
    except Exception as e:
        print("LLM error:", str(e))
        return None

# Override the original call_llm reference
call_llm = _call_llm_clean
