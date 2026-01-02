# 📋 Project Rules: Golden Keyword Miner

This document defines the core engineering principles and constraints for the Golden Keyword Miner project.

## 🏗 Stack Overview
- **Hosting**: Vercel (Next.js)
- **Database**: Turso (libsql)
- **Scheduler**: GitHub Actions (Main Miner), Vercel Cron (Docs Filler)

## 💎 Turso DB Strategy (Cost Optimization)
- **Primary Goal**: Minimize **Row Writes**.
- **Deferred Writes**: Collect items in memory first. Batch insert at the end of the execution.
- **Strict Deduplication**:
  - **Never** perform a raw `INSERT OR IGNORE` without checking.
  - **Always** query existing keywords first and subtract them from the insertion list.
- **Chunking**: Break large DB operations into chunks of 500-1000 items.

## ⛏ Mining & API Integrity
- **Rate Limit Respect**: Use `KeyManager` for Naver API calls. Always honor 429 cooldowns.
- **Stateless Operation**: Ensure functions can restart at any point. Use `updated_at` and state flags (`is_expanded`) correctly.
- **Deadline Awareness**: Most Vercel functions have a 60s limit. Logic must auto-terminate and save state at 58s.

## ☁️ Environment Management
- **Sync required**: Ensure the following keys are identical in Vercel and GitHub Secrets:
  - `NAVER_AD_API_KEYS`
  - `NAVER_SEARCH_API_KEYS`
  - `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
  - `CRON_SECRET`

## ⌨️ Coding Standards
- **Strict Typing**: Avoid `any`. Define interfaces for API responses.
- **Descriptive Logging**: Use prefixes like `[Batch]`, `[Miner]`, `[KeyManager]`.
- **Error Propagation**: Catches should log context (e.g., which seed failed).

---
*Last Updated: 2026-01-02*
