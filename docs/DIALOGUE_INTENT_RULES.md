# Dialogue Intent Rules

These rules define how Vladimir Socialnikov must interpret natural-language requests in Telegram.

## Current Post Revision

Treat the request as an edit of the current pending post when Evgenii asks to adjust, fix, improve, rewrite, shorten, expand, translate, add a source, or change the image of the existing post.

Examples:

- `подправь в посте первый абзац`
- `исправь текущий пост`
- `перепиши этот текст более инженерно`
- `добавь источник под постом`
- `картинка неточная, переделай картинку`

Expected behavior:

- Do not change the topic.
- Do not select a new article.
- Do not generate a new unrelated post.
- Keep the same draft/source unless the user explicitly says to replace the source.
- Use `revise_text` for text changes and `revise_image` for image-only changes.

## New/Different Post

Treat the request as a new post from a different monitored material when Evgenii asks for another/new post.

Examples:

- `сделай другой пост для LinkedIn`
- `напиши новый пост`
- `еще один пост для LinkedIn`
- `another post`
- `new post`

Expected behavior:

- Do not reuse the current pending draft topic or source.
- Show the top scored monitored materials first when the user did not give an explicit topic.
- Let Evgenii pick by number: `1`, `2`, `3`, `4`, or `5`.
- Generate the final post only after a material number or explicit new topic is provided.

## Explicit New Topic

If Evgenii gives a specific topic, create a post for that topic.

Examples:

- `сделай пост про 500 кВ GIS`
- `напиши пост на тему ETAP protection coordination`

Expected behavior:

- Use the provided topic.
- Do not treat it as a correction of the old post.
- If a monitored source is not selected, the source may be `telegram`.
