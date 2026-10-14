# Security

- Login required on every device (Supabase Auth). Public sign-up disabled after my account exists.
- Row Level Security on every table: user_id = auth.uid(). It protects client access (anon key, Realtime). The tables the app listens to live have `REVOKE ALL FROM anon` and `GRANT SELECT TO authenticated` only (migration 0011), because Realtime DELETE events skip RLS.
- The backend connects as the postgres role, which bypasses RLS, so every backend query is scoped by user_id through one shared helper, with tests proving one user can never read another user's rows.
- Apps hold only the Supabase anon key and API URL. The anon key is public by design; RLS protects the data.
- JWTs are verified on the server with the Supabase public JWKS (no shared JWT secret).
- Server-only secrets: database URL, Supabase service role key (not used yet), OmniRoute keys, Google client secret, token encryption key (these three arrive in Step 3 and 4). Stored in apps/server/.env (server) and infra/.env (DuckDNS and backup) on the server, chmod 600, never committed. Today the server reads only SUPABASE_URL and DATABASE_URL.
- Google tokens encrypted with AES-256-GCM before saving.
- OmniRoute is never exposed to the internet: reachable only from the Docker network and over Tailscale.
- Caddy is the only public service: TCP 80 and TCP and UDP 443 are public, SSH (22) is allowed from my IP only (to do: it is still open to anywhere), and port 3000 is never opened. The server runs with cap_drop ALL, no-new-privileges, a read-only filesystem, and a non-root user. trustProxy is on, which is only safe because port 3000 is never published.
- SSH: key login only, password login disabled (the AWS default).
- AI: external and destructive actions always need my confirmation (enforced by the action registry; the app's buttons count as confirmation); every action is logged in Step 3 (no log table yet).
- Logs never contain tokens, email bodies, or file contents. The server redacts the Authorization and cookie headers, logs only the URL path (no query string), and drops the SQL text and parameters of failed database queries (it keeps the database's own message and error code). Error responses are generic (500 "Something went wrong").
- CORS allows only the Tauri origins and the Vite dev server unless CORS_ORIGINS says otherwise. The desktop app's CSP (apps/desktop/src-tauri/tauri.conf.json) allows scripts only from the app itself and network only to the local server (127.0.0.1:3000), Supabase, and *.duckdns.org; the release CSP still allows http://127.0.0.1:3000 for development. The asset protocol is scoped to $APPDATA/wallpapers.
- .dockerignore keeps every .env file out of the Docker image.
- Database backup script (30 days kept) to an S3-compatible bucket; it is not scheduled yet because the backup target is not chosen (Oracle Object Storage is the planned target).
- Cloud budget alert (AWS about $5, Oracle ₹1) to catch any unexpected charge (to do for AWS).
