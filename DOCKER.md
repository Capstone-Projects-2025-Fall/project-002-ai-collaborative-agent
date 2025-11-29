# Docker quickstart

This repository contains Dockerfiles and a docker-compose setup for two components:

- Documentation site (Docusaurus) at `./documentation` — built and served with nginx.
- VS Code extension builder at `./vscode-extension` — builds the TypeScript output in `/app/out`.

Quick commands

Build images with docker-compose (from repo root):

```bash
docker compose build
```

Bring up the docs site (background):

```bash
docker compose up -d docs
```

Visit the docs at: http://localhost:3000

Run the extension builder (will run and sleep so you can inspect build output via volume):

```bash
docker compose up extension-builder
```

Notes and tips

- The `documentation` Dockerfile builds the static site and serves it with nginx on container port 80, mapped to host port 3000 by the compose file.
- The `vscode-extension` Dockerfile is a builder image. It runs `npm run compile` and leaves build outputs under `/app/out`. The compose service mounts the repo `./vscode-extension` into `/app` so you can inspect `out/` on the host after a build.
- Do not commit secrets or API keys into images or source. Use environment variables with `.env` or your CI secret store.

Customizing

- If you prefer to run the Docusaurus dev server for live reload, run locally with `npm start --prefix documentation` instead of using the production image.
- To produce a `.vsix` package from the extension builder, install `vsce` in the builder image and run `vsce package` (this requires extra setup in the Dockerfile and typically a CI environment).

If you want, I can:

- Add a dev-mode compose service for the docs (`npm start`) that supports hot reload.
- Make the extension-builder produce a `.vsix` automatically and store it under `./vscode-extension/dist`.
