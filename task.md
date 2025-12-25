# Task: 네이버 황금키워드 채굴기 (Golden Keyword Miner) 구축

## 0. Project Initialization
- [x] Initialize Next.js 14+ App Router project.
- [x] Install dependencies: `supabase-js`, `@tanstack/react-query`, `@tanstack/react-virtual`, `axios`, `date-fns`, `lucide-react`.
- [x] Setup `task.md`.

## 1. Environment & Database
- [x] Create `.env.local` template with Supabase keys and API keys placeholders.
- [x] Create `supabase/schema.sql` for the user to set up the DB.
- [x] Configure `utils/supabase.ts` client.

## 2. Shared Utilities
- [x] Implement `utils/key-manager.ts` (Round Robin, Rate Limit, Cooldown).

## 3. Backend: Mining Engine
- [x] Implement `app/api/miner/execute/route.ts`:
  - Authenticaton (cron secret).
  - Fetch target keywords (Expansion/Update).
  - Fetch Related Keywords (Ad API).
  - Filter logic (Volume < 1000, Blacklist, Duplicate).
  - Fetch Document Counts (Search API) with concurrency control.
  - Bulk Upsert to Supabase.

## 4. Frontend: Insight Dashboard
- [x] Setup TanStack Query Provider (`components/Providers.tsx`).
- [x] Implement `components/KeywordList.tsx` with TanStack Virtual.
- [x] Implement `app/insight/page.tsx` with Infinite Scroll and filters.

## 5. Configuration
- [x] Create `vercel.json` for timeout settings.
- [x] Update `next.config.js`.

## 6. Manual & Verification
- [x] Verify build.
- [x] Write `CEO_MANUAL.md`.

## 7. Additional Features & Enhancements (Completed)
- [x] **Manual Mining Mode**: Real-time mining via Homepage UI (`components/ManualMiner.tsx`).
- [x] **Security Hardening**: `robots.txt` and meta tags to block crawlers (Private Mode).
- [x] **Navigation & Layout**: Added Navbar, Footer, and dedicated sub-pages (About, Contact, Data).
- [x] **Refactoring**: Extracted core logic to `utils/mining-engine.ts` for reusability.

## 8. Optimization & Automation (Current Phase)
- [x] **Parallel API Key Management**: Implemented `KeyManager` to utilize 13 keys (4 Ad, 9 Search) simultaneously.
- [x] **Robust Retry Logic**: Added multi-key retry mechanisms for both Ad and Search APIs.
- [x] **Batch Runner Utility**: Created `batch-runner.ts` to coordinate `FILL_DOCS` and `EXPAND` modes efficiently.
- [x] **Manual Batch Trigger**: Added server action and UI button for on-demand batch execution with detailed feedback.
- [x] **Github Cron**: Configured `.github/workflows/miner-cron.yml` to run every 10 minutes.
- [x] **Monitoring Dashboard**: Create `/monitor` page to view system status and keyword statistics.
- [x] **Throughput Optimization**: Increased batch limits (50 items) and prioritized processing by high search volume.

## 9. UI Refinements
- [x] **Reorder Data Columns**: Updated attribute order in KeywordList as requested (Keyword -> Total Search -> Docs -> Ratio -> Tier -> Search/Click/CTR/Comp).

## 10. Code Optimization
- [x] **API Response Caching**: Applied `revalidate = 60` to `/api/keywords`.
- [x] **Parallel Mining**: Optimized `mining-engine.ts` to process document lookups with full concurrency.


- [x] **Massive Scale Optimization**: Implemented dynamic concurrency scaling in `batch-runner.ts` to utilize "very many" API keys automatically (up to 300 concurrent requests).
