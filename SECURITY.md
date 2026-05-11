# Security

Do not commit real tokens, API keys, access tokens, refresh tokens, or webhook secrets.

Production credentials should be stored as Cloudflare Worker secrets:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put GEMINI_API_KEY
```

The local `.dev.vars` file is intentionally ignored by git.

If a credential is accidentally exposed, revoke it in the provider dashboard and rotate the Cloudflare secret immediately.
