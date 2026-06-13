# Verity — RAG Pipeline with Hybrid Search

End-to-end Retrieval-Augmented Generation over internal documents. Retrieval runs dense (ChromaDB, `text-embedding-3-small`) and sparse (BM25) searches in parallel, fuses them with weighted Reciprocal Rank Fusion, and reranks candidates with an LLM-as-judge cross-encoder pass. Generation is constrained to the retrieved context with inline bracketed citations; every citation is then independently verified by a judge model, and each answer ships with a composite confidence score (retrieval quality × citation coverage × completeness). Unanswerable questions are refused rather than hallucinated, and a bundled 30-case golden Q&A suite measures all of it.

## Architecture

```mermaid
flowchart LR
    subgraph Ingestion
        U[Upload<br/>PDF / MD / TXT / HTML] --> P[Parse<br/>PyMuPDF / BS4]
        P --> C[Chunk<br/>fixed | recursive | semantic]
        C --> D[Dedup<br/>cosine > 0.95 → skip]
        D --> V[(ChromaDB<br/>dense vectors)]
        D --> B[(BM25<br/>sparse index)]
    end

    subgraph Query
        Q[Question] --> DS[Dense search<br/>cosine top-10]
        Q --> SS[Sparse search<br/>BM25 top-10]
        DS --> RRF[Reciprocal Rank Fusion<br/>α·dense + (1−α)·sparse]
        SS --> RRF
        RRF --> RR[LLM-as-judge rerank<br/>top-5]
        RR --> G[Grounded generation<br/>gpt-4o, cite-or-refuse]
        G --> CV[Citation verification<br/>per-claim judge, 1–5]
        CV --> CS[Composite confidence<br/>0.3·retrieval + 0.4·citation + 0.3·completeness]
    end

    V -.-> DS
    B -.-> SS
```

## Quickstart (Docker — recommended)

Prereqs: Docker Desktop running.

```bash
cp backend/.env.example backend/.env   # then set OPENAI_API_KEY
docker compose up
```

That's it — both services build and start together. Open http://localhost:5173; API docs live at http://localhost:8000/docs. First startup seeds the bundled sample corpus (6 engineering docs for a fictional company) into both indexes, so the app answers questions immediately. Uploaded documents, vector/BM25 indexes, and eval history persist in `backend/data/` across restarts via a bind mount.

| Task | Command |
|------|---------|
| Start (foreground, Ctrl+C to stop) | `docker compose up` |
| Start in background | `docker compose up -d` |
| Stop | `docker compose down` |
| Rebuild after code changes | `docker compose up --build` |
| Tail logs | `docker compose logs -f` |

## Deploy your own (Render, free)

The repo ships a [`render.yaml`](render.yaml) Blueprint that stands up both services in one shot:

1. Push this repo to GitHub.
2. In [Render](https://render.com): **New ▸ Blueprint** → pick this repo → **Apply**. It creates the FastAPI backend (Docker) and the static frontend, and wires the frontend's `VITE_API_BASE` to the backend URL.
3. On the **backend** service, set the one secret that is *not* in git: `OPENAI_API_KEY`.
4. After the first deploy, confirm the backend URL matches `VITE_API_BASE` on the frontend service (Render appends a suffix if the chosen name was taken); redeploy the frontend if it changed.

On the free plan the backend sleeps after ~15 min idle and cold-starts on the next request (the first answer is slow), re-seeding the bundled corpus each time so the demo always works. Uploaded documents aren't persisted on free instances — attach a paid disk at `/app/data` (commented block in `render.yaml`) if you need persistence.

## Capping the spend

A public URL means strangers spend *your* OpenAI credit on every question, so the deployment is locked down in two complementary layers.

**1. In-app guardrails** (`PUBLIC_DEMO_MODE=true`, on by default — see [`backend/config.py`](backend/config.py)):

| Control | Default | Env var |
|---------|---------|---------|
| Per-IP cap on `/v1/ask` per UTC day | 20 | `RATE_LIMIT_PER_IP_DAILY` |
| Global cap on `/v1/ask` per UTC day (kill-switch) | 300 | `RATE_LIMIT_GLOBAL_DAILY` |
| Document upload (`/v1/ingest`) | admin-only | — |
| Eval suite (`/v1/eval/run`, the most expensive call) | admin-only | — |

Limits reset at 00:00 UTC. `GET /v1/usage` reports the caller's remaining budget. To bypass the limits and reach the admin-only endpoints, send the secret as a header: `X-Admin-Key: <ADMIN_API_KEY>` (Render generates this value for you under the backend service's **Environment**).

**2. Account-level hard limit** — the ultimate backstop, set once in OpenAI's dashboard (only the account owner can do this):
> [platform.openai.com](https://platform.openai.com) → **Settings ▸ Limits ▸ Usage limits** → set a **monthly budget / hard limit** (e.g. \$10). At the hard limit OpenAI stops serving requests outright, regardless of app-level controls.

Set both: the in-app caps shape day-to-day demo traffic; the dashboard hard limit guarantees the bill can never exceed a number you chose.

## Quickstart (manual, no Docker)

Prereqs: Python 3.11+, Node 18+.

**1. Backend**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then set OPENAI_API_KEY
uvicorn main:app --reload --port 8000
```

**2. Frontend**

```bash
cd frontend
npm install
npm run dev
```

**3. Open** http://localhost:5173.

## API Reference

Full OpenAPI docs at `/docs`. Summary:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/ask` | POST | Full pipeline: retrieve → rerank → generate → verify → score |
| `/v1/ingest` | POST | Multipart upload; chunking strategy/size/overlap per request |
| `/v1/documents` | GET | Indexed documents with chunk counts and strategies |
| `/v1/documents/{id}` | DELETE | Remove a document from both indexes |
| `/v1/eval/run` | POST | Run the 30-case golden suite; returns a full report |
| `/v1/eval/progress` | GET | Poll during a run (drives the UI progress bar) |
| `/v1/eval/results` | GET | All past runs (trend data) |
| `/v1/stats` | GET | Index size, rolling confidence, mode distribution |

## Chunking Strategies

| Strategy | How it splits | Use when | Tradeoff |
|----------|---------------|----------|----------|
| `fixed` | Equal-size windows + overlap | Uniform prose, logs, transcripts | Cheap and predictable; happily cuts mid-thought |
| `recursive` | Headings → paragraphs → sentences, falling through separators | Structured docs (the default) | Respects document structure; chunk sizes vary |
| `semantic` | Boundary where adjacent-sentence embedding similarity dips below mean − σ | Dense unstructured prose where topic shifts matter | Best boundaries; costs one embedding call per sentence at ingest |

Strategy, chunk size, and overlap are per-upload parameters; each chunk records its strategy in metadata, so eval runs can compare strategies on the same corpus.

## Design Decisions

**Why hybrid beats dense-only for technical docs.** Embedding models smear rare exact tokens — `shipctl`, `X-Meridian-Key`, `mk_test_` — into a semantic neighborhood where they lose to fluent paraphrases. BM25 treats those tokens as near-unique keys and nails them. Conversely, BM25 scores zero on paraphrases ("undo a bad release" shares no tokens with `rollback`). Technical-docs queries are a mix of both shapes, so fusing the two retrievers dominates either alone. The Compare tab demonstrates this live.

**Why RRF instead of score averaging.** Cosine similarity (≈0.2–0.9, bounded) and BM25 (unbounded, corpus-dependent) live on incomparable scales; any linear combination needs per-corpus normalization that drifts as documents are added. RRF discards scores and fuses ranks — `Σ wᵢ/(k + rankᵢ)` — which is scale-free, stable under index growth, and exposes a single interpretable knob (the dense weight α).

**Why LLM-as-judge for reranking instead of a cross-encoder model.** A dedicated cross-encoder (e.g. a MiniLM variant) is cheaper per query, but it adds a model artifact to deploy, pins a tokenizer/runtime, and caps quality at its training distribution. The judge call evaluates query×passage jointly with gpt-4o-level reading comprehension, needs zero deployment surface beyond the API key already required, and reuses the same JSON-judging machinery as citation verification and eval grading. At top-10 candidate pools the latency cost is one batched call.

**Why citation verification is a separate pass.** Generation models cite plausibly, not faithfully. Verifying each claim-passage pair post-hoc with an independent judge converts citations from decoration into a measurable contract — and feeds citation coverage into the confidence score, so unsupported citations visibly drag the answer's score down.

**Why composite confidence, not model self-assessment.** A single "how confident are you?" number from the generator is poorly calibrated. The composite combines three independently measured signals: mean cosine similarity of the context actually used (retrieval), fraction of citations that survived verification (grounding), and a judge score for whether the whole question was addressed (completeness), weighted 0.3 / 0.4 / 0.3.

## Eval Results

Measured on the bundled sample corpus (recursive chunking, hybrid retrieval, α = 0.7), 2026-06-12:

| Metric | Value |
|--------|-------|
| Pass rate (30 cases) | 83.3% (25/30) |
| Avg correctness (LLM-as-judge, 1–5) | 4.3 |
| "I don't know" accuracy (6 unanswerable) | 100% (6/6) |
| Avg latency per eval case | 15.5 s¹ |

All 10 lookups and all 8 multi-hop cases pass; the 5 failures are ambiguous-category questions where the system answers one valid interpretation instead of enumerating all of them — the failure mode that category exists to surface.

¹ Eval latency includes citation verification and correctness judging on a rate-limited (30K TPM) OpenAI org; interactive `/v1/ask` queries measure 6–10 s.

The golden set: 10 direct lookups, 8 multi-hop questions spanning 2+ documents, 6 unanswerable questions (refusal is the pass condition), 6 ambiguous questions. Per-question results include correctness, retrieval relevance, and citation accuracy; run history is persisted and charted in the Eval tab.

## Repository Layout

```
backend/
  main.py               FastAPI app + lifespan (seeds sample corpus on first run)
  config.py             All settings via env vars (pydantic-settings)
  routers/              ask, ingest, documents+stats, eval
  services/             ingestion, embeddings, bm25_index, retrieval (RRF + rerank),
                        generation, citation_verifier, confidence, evaluator, pipeline
  models/               Pydantic v2 request/response models
  data/
    sample_corpus/      6 markdown docs (fictional company's internal docs)
    golden_qa.json      30-case eval set
    chroma/, bm25/      Persisted indexes (created at runtime)
frontend/
  src/api/              Typed client + types mirroring backend models
  src/tabs/             Ask, Documents, Eval, Compare
  src/components/       Confidence meter, citation cards, chunk panels, skeletons
```
