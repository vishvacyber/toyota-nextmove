# Toyota NextMove

A proactive, agentic financial co-pilot for Toyota Financial Services customers (HackTX).
It answers one question: "Given my situation today, what's the smartest next move for me and my Toyota?"

- Customer App (phone + kiosk) and Employee Console, backed by one FastAPI decision engine.
- The engine computes every number; the LLM only explains. A Guardian agent checks outputs before customers see them.
- Synthetic data only.

Product spec: [docs/SPEC.md](docs/SPEC.md) · Build rules: [CLAUDE.md](CLAUDE.md) · Stage prompts: [PROMPTS.md](PROMPTS.md)
