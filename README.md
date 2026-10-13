# @core/billing

[![genpm](https://api.genpm.net/v1/badge/@core/billing.svg)](https://genpm.net/p/@core/billing) ![license](https://img.shields.io/badge/license-MIT-blue)

> Stripe subscriptions: checkout, portal and idempotent webhooks with Drizzle

A [GenPM](https://genpm.net) module: **source code + AI rules + MCP config**, injected into your project instead of hidden in `node_modules`. The code lands in `src/lib/billing`, pinned to a verified commit, and you own it.

## Install

```bash
genpm add @core/billing
```

No genpm yet? `curl -fsSL https://genpm.net/install.sh | sh` (macOS/Linux), `irm https://genpm.net/install.ps1 | iex` (Windows), or one-off with `npx @genpm-net/cli add @core/billing`.

Or let your AI agent do it: run `genpm mcp setup` once, then ask *"add @core/billing with genpm"* in Claude Code, Cursor, VS Code, Windsurf, Codex or Gemini CLI. It shows you a dry-run plan before writing anything.

## What it does

Stripe subscriptions: checkout, customer portal, an idempotent webhook handler that mirrors subscriptions into the
database, and `hasEntitlement(user, feature)` for gating. Stripe is the source of truth. No usage-based billing,
invoices UI or taxes logic (configure those in Stripe).

## At a glance

- **GenPM dependencies** (installed with it): [@core/db](https://genpm.net/p/@core/db), [@core/auth](https://genpm.net/p/@core/auth), [@core/stripe](https://genpm.net/p/@core/stripe)
- **npm dependencies** (proposed, never installed without asking): `stripe`
- **Environment variables** (added to `.env.example`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **MCP servers** (only added with your consent): `stripe`
- **AI rules**: [`AGENTS.md`](AGENTS.md), loaded by your agent only when it works in `src/lib/billing`

## Security

GenPM installs a 40-character commit SHA (never a branch), verifies an Ed25519-signed manifest, never runs install scripts and scans AI rules for prompt injection. Details: [genpm.net/docs/security](https://genpm.net/docs/security).

## License

MIT — see [LICENSE](LICENSE). Browse the full catalog at [genpm.net](https://genpm.net).
