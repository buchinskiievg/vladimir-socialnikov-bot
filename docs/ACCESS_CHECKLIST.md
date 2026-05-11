# Access checklist

Do not paste tokens into chat. Store secrets with `npx wrangler secret put ...`.

## Required first

- Telegram bot token from BotFather.
- Your Telegram numeric user ID for `ALLOWED_TELEGRAM_USER_IDS`.
- Cloudflare account with Workers enabled.
- Cloudflare D1 database binding named `DB`.

## AI

- `GEMINI_API_KEY` from Google AI Studio.
- Text model name in `GEMINI_TEXT_MODEL`, default `gemini-2.5-flash-lite`.
- Optional fallback: `OPENAI_API_KEY` and `OPENAI_TEXT_MODEL`.
- Image generation provider/key, to be wired after the preferred provider is chosen.

## LinkedIn

- LinkedIn Developer app.
- Posting permission/product access for organic posts.
- `LINKEDIN_ACCESS_TOKEN`.
- `LINKEDIN_ORGANIZATION_URN` if posting as a company page.
- Confirm whether posting is as personal profile or company page.

## Reddit

- Reddit app client ID.
- Reddit app client secret.
- Refresh token for the account that will post.
- Subreddit allow-list. Start with one controlled/test subreddit.
- `REDDIT_SUBREDDIT`.
- `REDDIT_USER_AGENT`.

## Facebook

- Meta Developer app.
- Facebook Page ID.
- Page access token.
- Permissions for Page publishing.
- `FACEBOOK_PAGE_ID`.
- `FACEBOOK_PAGE_ACCESS_TOKEN`.

## Instagram

- Instagram Business or Creator account.
- Connected Meta app permissions for content publishing.
- Instagram business account ID.
- Access token.
- Media hosting location for generated images, preferably Cloudflare R2 public/object URL.

## Threads

- Threads user ID.
- Threads access token.
- App permissions for Threads content publishing.

## Forums and monitoring sources

For each source:

- Source type: `rss`, `news`, `forum`, or later `api`.
- Topic label.
- Public URL or RSS feed URL.
- Notes about posting/participation rules.

Use `/source add rss <topic> <url>` in Telegram for each RSS/news feed.
