"""LeadPilot optional Python reasoning workforce."""
from __future__ import annotations

import hashlib
import html
import hmac
import json
import os
import re
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from general_manager import choose_agents, build_response

REASONING_AGENTS = {
    "lead-finder", "trend-finder", "opportunity-finder", "tender-finder",
    "ecommerce-opportunity", "workpilot", "content", "competitor-monitor",
    "outreach", "website-brand", "gbp-audit", "gbp-outreach", "gbp-fix",
    "general-manager",
}
MAX_BODY_BYTES = 1_000_000


def words(text: str) -> list[str]:
    return [x for x in re.split(r"[^a-zA-Z0-9+#.]+", text.lower()) if len(x) > 2]


def score(text: str, query: str) -> int:
    q, t = set(words(query)), set(words(text))
    return max(25, min(98, 45 + len(q & t) * 9))


def fetch_rss(query: str, limit: int = 12):
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LeadPilot Python Agent/1.0"})
        with urllib.request.urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8", errors="replace")
        items = []
        for block in re.findall(r"<item[\s\S]*?</item>", raw, re.I)[:limit]:
            def tag(name):
                match = re.search(rf"<{name}[^>]*>([\s\S]*?)</{name}>", block, re.I)
                if not match:
                    return ""
                # Remove CDATA wrappers BEFORE stripping tags: stripping first
                # also strips the CDATA text itself, losing every description.
                raw = match.group(1).replace("<![CDATA[", "").replace("]]>", "")
                return html.unescape(re.sub(r"<[^>]+>", " ", raw)).strip()

            item = {"title": tag("title"), "description": tag("description"), "url": tag("link"), "posted": tag("pubDate")}
            if item["title"] and item["url"]:
                items.append(item)
        return items, []
    except Exception as exc:
        return [], [f"Public indexed research was unavailable: {type(exc).__name__}"]


def lead_finder(payload: dict[str, Any]) -> dict[str, Any]:
    businesses = payload.get("businesses") if isinstance(payload.get("businesses"), list) else []
    query = str(payload.get("query", "")).strip()
    output = []
    for business in businesses:
        if not isinstance(business, dict):
            continue
        name = str(business.get("name") or "business")
        industry = str(business.get("industry") or payload.get("industry") or "business")
        city = str(business.get("city") or payload.get("city") or "")
        website = str(business.get("website") or "")
        signals, missing = [], []
        if website:
            signals.append("public website")
        else:
            missing.append("website")
        if business.get("phone") or business.get("email"):
            signals.append("direct contact")
        else:
            missing.append("direct contact")
        text = f"{name} {industry} {city} {website} {business.get('address', '')}"
        output.append({
            "businessId": business.get("id"),
            "enrichmentSummary": f"{name} is a {industry}{(' in ' + city) if city else ''}. Evidence-backed enrichment found {', '.join(signals) if signals else 'limited public signals'}.",
            "signals": signals,
            "missing": missing,
            "recommendedOffer": "AI lead generation and follow-up automation" if website else "AI-powered website and lead-capture automation",
            "enrichmentScore": score(text, query or industry),
            "confidence": "medium" if signals else "low",
        })
    return {"agent": "lead-finder", "results": output, "warnings": []}


def website_brand(payload: dict[str, Any]):
    query = str(payload.get("query", "")).strip() or "business website"
    q = query.lower()
    industry = "hospitality" if re.search(r"restaurant|food|cafe|bar|hotel", q) else "professional services" if re.search(r"real estate|property|realtor", q) else "local service" if re.search(r"plumb|hvac|roof|contractor|construction|cleaning", q) else "creative" if re.search(r"agency|marketing|photograph|design|beauty|fashion", q) else "software" if re.search(r"saas|software|app|ai|tech", q) else "business"
    personality = {
        "hospitality": ["warm", "inviting", "visual"],
        "professional services": ["credible", "clear", "confident"],
        "local service": ["practical", "trustworthy", "direct"],
        "creative": ["distinctive", "human", "expressive"],
        "software": ["clear", "modern", "focused"],
        "business": ["professional", "human", "clear"],
    }[industry]
    return {
        "agent": "website-brand",
        "results": [{
            "name": query,
            "industry": industry,
            "brandDirection": {"personality": personality, "tone": "conversational, specific and customer-first"},
            "websitePlan": {"pages": ["Home", "Services", "About", "FAQ", "Contact"], "mobileFirst": True},
            "copy": {"headline": f"A clearer way to choose {query}", "cta": "Talk to us"},
        }],
        "warnings": [],
    }


def generic(payload):
    agent, query = str(payload.get("agent")), str(payload.get("query", ""))
    if agent in {"outreach", "gbp-outreach"}:
        return {"agent": agent, "results": [{"draft": f"Hi — I noticed an opportunity around {query}. I can help review it and outline practical improvements for your business. If useful, I can send over the details for your review."}], "warnings": []}
    if agent == "content":
        return {"agent": agent, "results": [{"title": f"Content plan for {query}", "items": ["Customer problem post", "Useful educational post", "Proof/evidence post", "Clear next-step post"]}], "warnings": []}
    return {"agent": agent, "results": [{"title": f"Python analysis for {query}", "summary": "Reasoning worker response; TypeScript retains business rules and side effects."}], "warnings": []}


def research(payload):
    agent, query = str(payload["agent"]), str(payload.get("query", ""))
    terms = {
        "trend-finder": f"current emerging trends {query} market demand news",
        "opportunity-finder": f"{query} business opportunity customer demand pain points market gap companies",
        "tender-finder": f"{query} public tender procurement contract request for proposal government bid",
        "ecommerce-opportunity": f"{query} product demand customer buying intent ecommerce market opportunity",
    }[agent]
    items, warnings = fetch_rss(terms, int(payload.get("limit") or 20))
    results = [{
        # Deterministic id across restarts: Python's hash() is salted per
        # process, so abs(hash(url)) changes on every restart.
        "id": f"{agent}-{hashlib.md5(item['url'].encode('utf-8')).hexdigest()[:16]}",
        "title": item["title"],
        "description": item["description"],
        "url": item["url"],
        "source": "Google News indexed evidence",
        "posted": item["posted"],
        "score": score(item["title"] + " " + item["description"], query),
    } for item in items]
    return {"agent": agent, "results": results, "warnings": warnings}


def run(payload):
    agent = payload.get("agent")
    if agent == "general-manager":
        query = str(payload.get("query", ""))
        requested = payload.get("agents") if isinstance(payload.get("agents"), list) else []
        agents = choose_agents(query, requested)
        context = {key: value for key, value in payload.items() if key not in {"query", "agents", "account_id", "agent", "results"}}
        return build_response(query, agents, context, payload.get("results") if isinstance(payload.get("results"), list) else [])
    if agent not in REASONING_AGENTS:
        return {"error": f"Python worker does not own agent: {agent}"}
    if agent == "lead-finder":
        return lead_finder(payload)
    if agent == "website-brand":
        return website_brand(payload)
    if agent in {"trend-finder", "opportunity-finder", "tender-finder", "ecommerce-opportunity"}:
        return research(payload)
    return generic(payload)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"status": "ok", "service": "leadpilot-python-agents"})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in {"/run", "/v1/agents/general-manager"}:
            return self.send_json(404, {"error": "not found"})

        configured_secret = os.environ.get("PYTHON_AGENT_SECRET", "")
        supplied_secret = self.headers.get("X-LeadPilot-Worker-Secret", "")
        if not configured_secret or not hmac.compare_digest(supplied_secret, configured_secret):
            return self.send_json(401, {"error": "unauthorized"})

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                return self.send_json(413, {"error": "request body is missing or too large"})
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                return self.send_json(400, {"error": "JSON object required"})
            if self.path == "/v1/agents/general-manager":
                payload["agent"] = "general-manager"
            result = run(payload)
            self.send_json(200 if "error" not in result else 400, result)
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "invalid JSON"})
        except Exception:
            self.send_json(500, {"error": "python agent failed safely"})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
