# Agent architecture

## Languages: one runtime on purpose
Everything that runs per request is **TypeScript on Cloudflare Workers**: the LLM router, grounding rules, Redis
cache, memory, orchestration and all agents. One language means one deploy, one type system and no extra network hop
between an agent and its data. Python stays optional (`services/python-agents`, `PYTHON_AGENT_URL`) for heavy batch
work such as large-scale scraping or NLP that cannot run inside a Worker. Nothing depends on it.

## What happens on every agent run (after sign-in)
1. **Rate limit** per user (Redis, `AGENT_RATE_LIMIT_PER_HOUR`).
2. **Session**: the user's session with that AI employee is reused for 30 minutes (`agent_sessions`).
3. **Memory recall**: the most important unexpired notes for that employee (`agent_memories`), hot-cached in Redis for 60 s.
4. **Result cache**: identical requests in the last 10 minutes are served from Redis.
5. **Run the agent** against real sources (OpenStreetMap, Photon, news, optional paid providers).
6. **Drop fake or unverifiable results** (`src/agents/grounding.ts`).
7. **Write a brief** with a language model that only sees the retrieved evidence, then strip anything not in that evidence.
8. **Remember** sourced findings and the outcome. Findings without a source URL are rejected, including by a database constraint.

## Rules that stop fake data
- A result is kept only if it has a name, a named source, and a real URL, phone number or street address.
- Placeholder text (lorem ipsum, example.com, John Doe, 555 numbers) is dropped.
- The model gets numbered evidence, must cite ids, and any email, phone number or URL it writes that is not in the evidence is removed.
- With no model key, or when every provider fails, the summary lists only what was retrieved. It never guesses.

## Keys and where they go
Set these as Cloudflare Worker secrets (not in the repo). See `.env.example` for the list.

| Purpose | Variable | Where to get it |
| --- | --- | --- |
| Groq (free tier) | `GROQ_API_KEY` | console.groq.com |
| Gemini (free tier) | `GEMINI_API_KEY` | aistudio.google.com |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai |
| xAI Grok (paid) | `XAI_API_KEY` | console.x.ai |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | console.upstash.com |

At least one model key is needed for written briefs. Redis is optional; without it the cache and rate limit are per-instance only.
