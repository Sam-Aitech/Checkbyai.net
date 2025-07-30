# Google OAuth Setup for Replit

Since `replit.dev` cannot be added as an authorized domain in Google Cloud Console, follow these steps:

## Google Cloud Console Configuration

### 1. OAuth Consent Screen
- **Application name**: `COS Check - Document Authenticator`
- **Authorized domains**: **Leave this field EMPTY** (don't add any domains)
- **Application home page**: Leave blank
- **Privacy policy**: Leave blank
- **Terms of service**: Leave blank

### 2. Credentials (OAuth 2.0 Client ID)
- **Application type**: Web application
- **Name**: COS Check App
- **Authorized redirect URIs**: Add this exact URL:
  ```
  https://da3ecd30-b16d-4788-a8ba-7feeaa4043e8-00-2vdug69y1lxnd.riker.replit.dev/api/auth/google/callback
  ```

## Why This Works
- Google OAuth works without authorized domains when the redirect URI is explicitly whitelisted
- The consent screen will show your application name instead of the domain
- This approach is commonly used for development and staging environments

## Testing
After configuring the above settings, wait 2-3 minutes for changes to propagate, then test the Google login button.