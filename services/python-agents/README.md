# LeadPilot Python Agent Worker

This is the optional Python reasoning worker. TypeScript remains the control plane and owns authentication, company permissions, approvals, persistence, and external side effects.

## Owned workloads

- WorkPilot
- Trend Finder
- Opportunity Finder
- Tender Finder
- E-commerce Opportunity

The worker also contains adapters for future GBP/outreach/content reasoning, but those remain behind the TypeScript control plane until their business-rule integrations are migrated safely.

## Run locally

Set the same high-entropy secret on the TypeScript application and Python worker:

```bash
export PYTHON_AGENT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
python service.py
```

Set the identical `PYTHON_AGENT_SECRET` value on both services. The TypeScript bridge sends it in the `X-LeadPilot-Worker-Secret` header. If either service has no secret configured, the bridge fails closed and the application uses its TypeScript fallback.

Health: `GET /health` (public, no sensitive data)  
Agent execution: `POST /run` (requires the shared secret).

## Render

Create a separate **Web Service** from this repository with:

- Root directory: `services/python-agents`
- Build command: `python -m py_compile service.py`
- Start command: `python service.py`

Set `PYTHON_AGENT_SECRET` on the Python service and set the exact same secret and `PYTHON_AGENT_URL` on the Next.js service. Generate a new random secret; do not commit it or put it in a public issue.

If `PYTHON_AGENT_URL` or `PYTHON_AGENT_SECRET` is empty, or the worker is unavailable, the TypeScript application uses its existing implementation instead.
