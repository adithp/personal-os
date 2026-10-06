# Decisions log

| # | Decision | Reason |
|---|---|---|
| 1 | Desktop first, mobile in Phase 2 | Build and stabilize the core before adding devices |
| 2 | Tauri 2 for desktop and mobile | Small, secure, one framework for both |
| 3 | Cloud database (Supabase) from day one | Desktop and mobile share data with no custom sync |
| 4 | Supabase free plan, Mumbai | Free, includes Postgres, auth, storage, realtime, pgvector; close to Kerala |
| 5 | Own backend server (not app-only) | Secrets stay safe, reminders run when devices are off, AI and Google shared by all devices |
| 6 | Node.js + TypeScript + Fastify | One language across the whole project, shared types with the apps |
| 7 | Oracle Cloud Always Free | Only option that stays free long term; AWS closes after 6 months, Azure credit lasts 30 days |
| 8 | OmniRoute as the AI gateway | One API for many providers, automatic fallback, free self-hosted |
| 9 | One OmniRoute for the assistant and coding tools | Separate keys and limits per use |
| 10 | Tailscale for coding tools access | OmniRoute never exposed to the internet |
| 11 | DuckDNS free subdomain | Free HTTPS domain for the server |
| 12 | Internal action system, not MCP | Full control of tools, permissions, and security |
| 13 | Online-first with cache, no full offline | Simpler; offline can be added later |
| 14 | Dark glass + light mode, pastel tiles, bottom dock with magnification | Chosen design from our discussion |
| 15 | Dock auto-hide, magnification, wallpaper configurable in Settings | Personal preference can change |
| 16 | AI providers start free and are configurable in Settings | Change models without code changes |
| 17 | Schedule-X for calendar views | Chosen for its modern look |
| 18 | Single user | Personal assistant for me only |
