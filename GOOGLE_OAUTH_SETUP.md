# Google OAuth Setup

Google login is **optional**. When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are unset,
the strategy and its routes are not registered and the login page hides the Google button
(the page checks `GET /api/auth/providers` to decide).

## 1. Create OAuth 2.0 credentials

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. **APIs & Services → OAuth consent screen** — set an application name (e.g. `CheckByAI`).
   Add your production domain under *Authorized domains* if you have one.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Add an **Authorized redirect URI** for each environment you run.

## 2. Redirect URI

The callback path is always `/api/auth/google/callback`. The origin is derived at startup
from `APP_URL` (falling back to `REPLIT_DOMAINS`, then `localhost:5000`) — see
`server/auth.ts`. Register the URI that matches the environment:

| Environment | Redirect URI |
|---|---|
| Local dev | `http://localhost:5000/api/auth/google/callback` |
| Production | `https://checkbyai.net/api/auth/google/callback` |
| Other host | `https://<your-APP_URL-host>/api/auth/google/callback` |

Set `APP_URL` to the exact origin with no trailing slash. A mismatch between `APP_URL` and
the URI registered in Google Cloud produces a `redirect_uri_mismatch` error at login.

## 3. Set environment variables

```env
GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret>
APP_URL=https://checkbyai.net
```

Restart the server after setting these — the strategy is registered once at boot.

## 4. Verify

```bash
curl https://<your-host>/api/auth/providers
# { "success": true, "data": { "google": true } }
```

If `google` is `false`, the credentials are not visible to the process. Google config
changes can take a few minutes to propagate before login succeeds.

## Behaviour on first login

A new user row is created with id `google_<profile id>`, `authProvider: 'google'`, and
`isVerified: true`. Existing users are matched on Google profile id. On success the user
is redirected to `/sponsor-monitor`; on failure, to `/login?error=auth_failed`.
