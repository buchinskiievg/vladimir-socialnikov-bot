# Social Telegram Worker Bot

New Telegram bot hosted on Cloudflare Workers.

This repository contains a human-approved social monitoring and publishing assistant for an electrical power engineering brand. It monitors configured public sources, prepares draft posts/leads, sends them to Telegram for approval, and only publishes after explicit approval.

## What is included

- Telegram webhook endpoint: `/telegram/webhook`
- Health check endpoint: `/health`
- Owner allow-list by Telegram user ID
- `/start`, `/help`, `/status`, `/post <text>` commands
- Social connector layer for LinkedIn, Facebook Page, and Instagram
- Approval workflow: `/draft`, `/pending`, `/approve`, `/reject`
- Scheduled monitoring hook, ready for news/forum/source ingestion
- Dry-run mode so posting logic can be tested before publishing anything

## Local setup

```powershell
cd "C:\Users\EvgeniiBuchinskii\Documents\Codex\2026-05-11\files-mentioned-by-the-user-build\social-telegram-worker-bot"
npm install
Copy-Item .dev.vars.example .dev.vars
```

Edit `.dev.vars` locally. Do not commit real tokens.

## Cloudflare setup

```powershell
npm run deploy
```

Set production secrets:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put LINKEDIN_ACCESS_TOKEN
npx wrangler secret put FACEBOOK_PAGE_ACCESS_TOKEN
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
npx wrangler secret put REDDIT_CLIENT_SECRET
npx wrangler secret put REDDIT_REFRESH_TOKEN
npx wrangler secret put THREADS_ACCESS_TOKEN
npx wrangler secret put GEMINI_API_KEY
```

Set non-secret production variables in `wrangler.toml`:

```toml
ALLOWED_TELEGRAM_USER_IDS = "123456789"
SOCIAL_DRY_RUN = "true"
META_GRAPH_API_VERSION = "v24.0"
```

Switch `SOCIAL_DRY_RUN` to `"false"` only after each social connector is tested.

## Register Telegram webhook

In PowerShell:

```powershell
$env:TELEGRAM_BOT_TOKEN="123456789:replace_me"
$env:WEBHOOK_SECRET="replace_with_random_long_string"
$env:PUBLIC_WORKER_URL="https://social-telegram-worker-bot.your-subdomain.workers.dev"
npm run set-webhook
```

## Important notes

- Facebook Page publishing is partly wired, but the Graph API version and permissions should be checked before production use.
- Instagram publishing is not text-only; it requires media container creation and publishing.
- LinkedIn publishing usually requires an approved app and correct organization/member permissions.
- Reddit and forum automation must respect community rules and official API limits.

## D1 database

For persistent drafts/leads, create a D1 database and add a binding named `DB`.

```powershell
npx wrangler d1 create social-telegram-worker-bot-db
npx wrangler d1 migrations apply social-telegram-worker-bot-db --local
```

Then add the generated D1 binding to `wrangler.toml` before production deployment.

See `docs/SOCIAL_AUTOMATION_PLAN.md` for the full roadmap.
See `docs/ACCESS_CHECKLIST.md` for the exact account data needed.

## Source datasets

- `data/europe_power_forum_sources.csv` - European forums/community sources.
- `data/social_group_sources.csv` - Reddit and Facebook group/search candidates.
- `data/rest_world_power_sources.csv` - non-European global sources across North America, LATAM, MENA/GCC, Africa, Asia-Pacific, and Oceania.

Facebook sources are stored as disabled candidates until they are manually reviewed and connected through a compliant access path.

## Telegram commands

```text
/status
/draft <topic>
/personal-draft <topic>
/company-draft <topic>
/pending
/approve <draft_id>
/reject <draft_id>
/source add rss <topic> <url>
/sources
/leads
/report
```

The bot also accepts natural-language Russian/English requests, for example:

```text
Владимир, подготовь публикацию для LinkedIn компании и персонального аккаунта про компенсацию реактивной мощности на промышленных объектах.
```

Conversation memory:

- Fast memory is stored in D1 for recent dialogue state and pending intents.
- Slow memory is archived to Cloudflare R2 as JSONL files for long-term continuity.
- Message retention target is 180 days.
