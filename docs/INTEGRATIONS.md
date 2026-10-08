# Google integrations

Status: planned for Step 4. Nothing here is built yet.

## 1. Google Cloud setup
- One Google Cloud project for Personal OS.
- APIs enabled: Gmail API, Google Calendar API, Google Drive API.
- OAuth consent screen: External, publishing status Testing, my Gmail added as the only test user.
- OAuth client type: Web application, redirect URI https://<duckdns-domain>/api/v1/google/callback.

## 2. Scopes
- https://www.googleapis.com/auth/gmail.modify
- https://www.googleapis.com/auth/gmail.send
- https://www.googleapis.com/auth/calendar
- https://www.googleapis.com/auth/drive

## 3. Login flow
1. In Settings → Accounts, I click Connect Google.
2. The desktop app opens the system browser at /api/v1/google/connect.
3. Google asks for permission and redirects to /api/v1/google/callback.
4. The backend encrypts the tokens (AES-256-GCM with TOKEN_ENCRYPTION_KEY) and stores them in google_accounts.

## 4. Weekly re-login
In Testing mode, Google refresh tokens expire after about 7 days. The app shows a "Reconnect Google" banner when a token fails or expires, and Settings shows days until re-login.

## 5. Sync
| Service | Method | Schedule |
|---|---|---|
| Gmail | History API from the stored history_id; saves email_refs only (no full bodies) | every 5 minutes |
| Calendar | Incremental sync with sync tokens into calendars and events | every 5 minutes |
| Drive | Changes API with the stored page token into file_refs | every 15 minutes |

- Email bodies and file contents are fetched live when opened, not stored.
- Creating or changing events writes to Google first, then updates the local row.
