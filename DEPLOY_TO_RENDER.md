# Deploying the EV Hub Investment Tool as a private demo

This package is ready for a temporary password-protected web deployment.

## Recommended host
Render Web Service, because this app uses the included Python server.

## What the password protection does
- If `DEMO_PASSWORD` is set, all pages and API routes require login.
- The login page stores a 12-hour HTTP-only session cookie.
- Change `DEMO_PASSWORD` any time to invalidate access for new sessions.
- Delete the Render service to take the demo fully offline.

## Deploy steps
1. Create a private GitHub repository.
2. Upload the contents of this folder to the repository.
3. In Render, choose **New > Web Service**.
4. Connect the GitHub repository.
5. Use:
   - Environment: `Python`
   - Build command: leave blank
   - Start command: `python local_site_location_server.py`
6. Add environment variables:
   - `DEMO_PASSWORD` = your chosen demo password
   - `DEMO_SESSION_SECRET` = a long random secret string
   - `DISABLE_BROWSER_OPEN` = `1`
7. Deploy.
8. Send the generated Render URL and password to your reviewer.

## Taking it fully offline
1. In Render, open the web service.
2. Delete the service.
3. Delete the GitHub repository or make it private/empty.
4. Remove any custom DNS records if you added them.
5. Confirm the Render URL no longer loads.

## Local test with password
```bash
DEMO_PASSWORD=test123 DISABLE_BROWSER_OPEN=1 python local_site_location_server.py
```
Then open http://localhost:10314/ and log in with `test123`.
