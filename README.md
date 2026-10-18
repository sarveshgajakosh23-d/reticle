# Reticle (full-stack, deploy-ready)
## Setup (2 minutes)
1. Copy your Reticle page to  public/index.html   (do not rename)
2. npm install
3. ANTHROPIC_API_KEY=your_key npm start      -> http://localhost:3000
Check: http://localhost:3000/healthz should show {"ok":true,"ai":true}

## Deploy
- Render.com: push this folder to GitHub > New Web Service > it reads render.yaml > add ANTHROPIC_API_KEY.
- Railway / Fly / any Docker host: use the Dockerfile; set ANTHROPIC_API_KEY (port 3000).
- Never commit .env. The API key lives only on the server.

## Add a language
Edit LANGS in server.js and LG in public/reticle-addon.js.
