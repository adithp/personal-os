# Security

- Login required on every device (Supabase Auth). Public sign-up disabled after my account exists.
- Row Level Security on every table: user_id = auth.uid(). It protects client access (anon key, Realtime).
- The backend connects as the postgres role, which bypasses RLS, so every backend query is scoped by user_id through one shared helper, with tests proving one user can never read another user's rows.
- Apps hold only the Supabase anon key and API URL. The anon key is public by design; RLS protects the data.
- JWTs are verified on the server with the Supabase public JWKS (no shared JWT secret).
- Server-only secrets: Supabase service role key, database URL, OmniRoute keys, Google client secret, token encryption key. Stored in infra .env files on the server, never committed.
- Google tokens encrypted with AES-256-GCM before saving.
- OmniRoute is never exposed to the internet: reachable only from the Docker network and over Tailscale.
- Caddy is the only public service; only ports 80 and 443 are open (cloud security group and host firewall).
- SSH: key login only, password login disabled.
- AI: external and destructive actions always need my confirmation; every action is logged.
- Logs never contain tokens, email bodies, or file contents.
- Nightly database backup to Oracle Object Storage, 30 days kept.
- Cloud budget alert (AWS about $5, Oracle ₹1) set to catch any unexpected charge.
