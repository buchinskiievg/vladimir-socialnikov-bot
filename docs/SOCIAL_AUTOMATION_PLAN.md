# Social automation plan

## Scope

The bot should support:

- LinkedIn
- Reddit
- Instagram
- Facebook
- Threads
- Worldwide forums and public communities

Main workflow:

1. Monitor configured topics and sources.
2. Find news, discussions, and possible leads.
3. Summarize findings and prepare post drafts.
4. Generate or attach images.
5. Send drafts to Telegram for approval.
6. Publish only after explicit approval.
7. Store leads and source history for follow-up.

## Architecture

- Telegram bot: control panel and approval queue.
- Cloudflare Worker: API/webhook, scheduled monitoring, publishing orchestration.
- Cloudflare D1: drafts, sources, leads, publishing history.
- Cloudflare R2: generated images and post media.
- Optional Cloudflare Queues: background jobs when monitoring grows.
- AI provider: draft rewriting, lead scoring, image prompts.
- Image provider: generated post images.

## Platform notes

- LinkedIn: use official Posts API. Access may require product permissions and app review.
- Reddit: use OAuth and official Reddit API. Posting should respect subreddit rules and account reputation.
- Instagram: Graph API requires a professional/business account. Publishing usually needs media containers; text-only publishing is not the normal model.
- Facebook: Page publishing can use Graph API with page access token and required permissions.
- Threads: use Threads API publishing flow; treat it separately from Instagram even though both are Meta.
- Forums: prefer RSS feeds, official APIs, search APIs, sitemap feeds, or explicit permission. Do not automate login-wall scraping or anti-bot bypassing.
- Facebook Groups: treat as manual-review candidates unless you have explicit group/admin permissions or a compliant Meta integration. Do not scrape private or login-only group content.

## Phases

### Phase 1 - Approval MVP

- Telegram commands: draft, pending, approve, reject.
- Manual topic-to-draft generation.
- Dry-run publishing preview.
- D1 persistence.

### Phase 2 - Real publishing

- Facebook Page connector.
- LinkedIn connector.
- Threads connector.
- Instagram media publishing.
- Reddit connector with subreddit allow-list.

### Phase 3 - Monitoring

- Source registry.
- RSS/news/search ingestion.
- Topic matching.
- Duplicate detection.
- Lead scoring.
- Telegram digest.

### Phase 4 - Scale

- Hundreds of monitored sources.
- Queue-based workers.
- R2 image storage.
- Analytics dashboard.
- CRM export.

## Guardrails

- Human approval before public posting.
- No spam posting.
- No credential sharing between accounts.
- No scraping private or login-only content.
- Per-platform rate limits and community rules are first-class constraints.
