# LetourneauHub

A Northernlion YouTube browser for uploads from 2021 onward: VOD/fresh classification, games grouped into categories (from Steam player tags), co-streamers, stream dates, per-browser watched tracking, and one-click YouTube playlists.

Put `YOUTUBE_API_KEY=your-key` in `.env`, then:

```sh
bun install
bun run crawl
bun run build
```

Open `site/index.html` directly in your browser; it's a single-page app with hash routes (`#/videos?…`, `#/games?…`), so every view and filter is bookmarkable and it works from disk or any static host. `site/` is the whole deployable app: `index.html`, `style.css`, `app.js` (built from `web/`), and `videos.js` (written by the crawler). Thumbnails and game art load from YouTube/Steam, so they need a connection.

- `bun run crawl` fetches new uploads (`--full` refreshes everything, including view counts). Steam metadata and player tags are cached in `data/steam.json`; the first run takes 10–15 minutes, later runs are quick.
- `bun run build` bundles `web/` into `site/app.js`; `bun run dev` rebuilds on change.
- `bun run check` type-checks and runs the tests.

Watched state lives in the browser's local storage, so it's per device. "Play all" and the play buttons on game tiles open a temporary YouTube playlist (YouTube caps these at 50 videos) in the current order; game tiles play unwatched VODs oldest-first.

The browser excludes Shorts. Videos without an explicit VOD or fresh marker appear under Unknown; unresolved games appear under Other. Steam demos share their full game, while DLC keeps its own.

## Deploying

Create a GitHub repo and push this project to `main`. Add the repository secret `YOUTUBE_API_KEY`, set Settings → Pages → Source to **GitHub Actions**, then run **Crawl and deploy** once manually from the Actions tab.

The workflow crawls daily at 13:17 UTC, commits updated data, and deploys `site/`. Pushes to `main` build and deploy. A local clone must run `bun install` and `bun run build` because `site/app.js` is built in CI and isn't committed.
