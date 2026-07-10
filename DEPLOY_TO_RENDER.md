# Render deployment — V17.44

1. Replace the deployed application with the contents of `EVHub_V17_44_lean.zip`.
2. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` at the service root.
3. Build command: `python -m py_compile server.py`
4. Start command: `python server.py`
5. Health path: `/api/health`

V17.44 does not block uploads based on `/api/version`. It sends the files first and validates the parsed response, matching the reliable behaviour used before the strict deployment gate was introduced.

After deployment, refresh the page once. The unique V17.44 asset URL prevents V17.42/V17.43 JavaScript from being reused by browser or CDN caches.
