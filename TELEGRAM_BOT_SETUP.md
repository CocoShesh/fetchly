# Fetchly Telegram bot

The Telegram bot uses Fetchly's existing media resolver. A user sends a supported public media URL; the bot replies with the title, creator, available video qualities, and a button that opens Fetchly with that URL already loaded. The user chooses a quality and watches or downloads the file on the Fetchly website. The bot does not upload the video to Telegram, so this flow avoids Telegram's bot file-upload limit.

## Vercel environment variables

Set these for the **Production** environment in the existing `fetchly` Vercel project, then deploy the project:

- `TELEGRAM_BOT_TOKEN`: the token created by BotFather. Keep it server-side and private.
- `TELEGRAM_WEBHOOK_SECRET`: a random value using only letters, numbers, `_`, and `-` (at least 32 characters is recommended).
- `TELEGRAM_ALLOWED_USERS`: comma-separated numeric Telegram user IDs. Use the numeric ID already configured in the bot's `ALLOWED_USERS`; Telegram usernames are not accepted for this check. The bot fails closed if this list is missing.
- `TELEGRAM_PUBLIC_URL`: `https://fetchly-weld.vercel.app`

Do not commit these values or send the BotFather token in chat. `MEDIA_BACKEND_URL` and `MEDIA_BACKEND_KEY` must also remain configured as required by the existing Fetchly deployment.

## Register the webhook

After the code is deployed and the three required secrets above are set in Vercel, run this in a terminal. It prompts for the token and secret without placing their values in shell history:

```bash
read -rsp 'BotFather token: ' BOT_TOKEN
printf '\n'
read -rsp 'Webhook secret: ' WEBHOOK_SECRET
printf '\n'
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode 'url=https://fetchly-weld.vercel.app/api/telegram/webhook' \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}"
unset BOT_TOKEN WEBHOOK_SECRET
```

Telegram should return `"ok":true`. The secret entered here must exactly match `TELEGRAM_WEBHOOK_SECRET` in Vercel. Test by sending `/start`, then a public YouTube or TikTok link to the bot.

## How it works and limits

- Telegram sends messages to the Vercel webhook. The handler acknowledges each update promptly, then checks the link through Fetchly's existing private media backend.
- Only IDs in `TELEGRAM_ALLOWED_USERS` can use the bot. Add another user by adding their numeric ID, separated by a comma.
- The “Open Fetchly” button opens the site with the URL prefilled and automatically checked. The video is played or downloaded by Fetchly in the user's browser; it is not transferred through Telegram.
- Platform access can still fail because of login requirements, rate limits, or restrictions. TikTok may return preview-only metadata without a downloadable stream.
- The webhook runs on Vercel and uses the project's existing media backend. Vercel function duration and the backend's own availability still apply; Render Free may sleep between requests.
