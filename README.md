# DSH Topic Desk

English | [简体中文](./README.zh-CN.md)

A local-first topic discovery plugin for single-user creators running DeepSeek Harness. The Host periodically collects trending metadata from 49 public sources, writes normalized rankings to a plugin-owned SQLite database, and exposes a dedicated Topic Desk page in the DSH sidebar.

The Client never accesses source websites or SQLite directly. It only uses the generated DSH Remote API to query persisted data or trigger a controlled refresh.

## Overview

| | |
|---|---|
| Package | `@dsh-topic-desk/plugin` |
| DSH Host plugin ID | `topic-desk` |
| Sources | 49 public feeds and data endpoints |
| Storage | Local SQLite at `./data/topic-desk.sqlite` |
| Collection | On startup, every 10 minutes, or manually |
| UI | Region/category/source filters, search, sorting, 20 items per page, and ranking history |
| Runtime | Node.js 24.19.0 via NVM; pnpm 11 |

## Built-in sources

The categories below match the UI filters. “Domestic” and “International” describe where the source organization is based, not the language of an individual feed.

| Region | Category | Platforms |
|---|---|---|
| Domestic | General | 36Kr, Huxiu, Toutiao, The Paper, Zhihu, Xiaohongshu, Sina Weibo, Douyin, Bilibili, Baidu |
| Domestic | Tech & AI | QbitAI, IT Home, C114, SSPAI, Solidot |
| Domestic | Finance & Markets | WallstreetCN, Odaily, Xueqiu, Jin10, Cailian Press |
| International | General | Wikipedia Chinese/Global, Mastodon Chinese/Global, Google Trends Chinese/Global, Bluesky, BBC Chinese, DW Chinese, RFI Chinese |
| International | Tech & AI | Hugging Face, arXiv, TechCrunch, The Verge, Ars Technica, MIT Technology Review, InfoQ |
| International | Finance & Markets | Binance Square Chinese/Global, CoinGecko, Polymarket, Federal Reserve, U.S. SEC, Bloomberg |
| International | Developer | Hacker News, GitHub, Stack Overflow, DEV Community, Lobsters |

Sources use public RSS, Atom, JSON, web endpoints, and selected public Orz News aggregation endpoints. When the first-party endpoints for 36Kr, Xueqiu, or Zhihu reject automated access, the collector automatically falls back to Orz News. Availability and anti-automation policies differ by platform. Each source has an independent health state, so one failure does not block other sources or delete the last successfully saved topics for that source.

## Features

- Processes up to 30 items per source per collection run by default.
- Stores `heat` when a source provides a reliable popularity value; otherwise stores `NULL`.
- Opens the original article in a new browser tab when its title or arrow is clicked.
- Does not fetch article bodies or write content into the chat composer.
- Supports All, Domestic, and International regions plus General, Tech & AI, Finance & Markets, and Developer categories.
- Provides 20-item pagination, source filtering, title search, ranking/update-time sorting, real ranking trends, position changes, and consecutive appearance counts.
- Collects from at most six sources concurrently to avoid connection spikes.
- Records overlapping runs for the same source as `skipped`.

## Using Topic Desk

All filters are combined with AND semantics:

```text
region ∩ category ∩ platform ∩ title search
```

The platform dropdown only shows platforms matching the selected region and category. For example, all current Developer sources are international, so “Domestic + Developer” returns no results; select All or International to view developer topics.

Changing the region, category, platform, search term, or sort order resets the page to the first page. Filtering and pagination run directly in the Host SQLite query, so the Client receives at most 20 items per page instead of loading every topic and hiding most of them in the browser.

## Quick start

```bash
nvm install
nvm use
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Run one live collection against a temporary database:

```bash
pnpm demo:collect -- /tmp/topic-desk.sqlite
```

The demo prints source health and a sample of collected topics as JSON. Live collection depends on network conditions and platform anti-automation policies. Unit tests never access the public internet and are deterministic.

## Architecture

```text
Public source endpoints
   |
   v
Host: request -> validate -> identify -> persist
   |                                  |
   |                             SQLite history
   v
Generated Remote API
   |
   v
Client: query -> filter/sort -> Topic Desk panel
```

- `src/index.ts` mounts the Host service and binds database and timer cleanup to the Cordis lifecycle.
- `src/coordinator.ts` manages startup, scheduled, and manual collection.
- `src/source-fetcher.ts` normalizes RSS, Atom, JSON, and public web sources into a shared topic format.
- `src/rss.ts` parses RSS and Atom metadata.
- `src/identity.ts` creates stable, source-scoped deduplication identities.
- `src/database.ts` and `src/repository.ts` handle SQLite initialization, transactions, queries, and history cleanup.
- `src/client/` contains sidebar registration, the panel, localization, and scoped styles.
- `db/schema.sql` is the single source of truth for the database schema shipped in the package.

## Configuration

| Option | Default | Description |
|---|---:|---|
| `databasePath` | `./data/topic-desk.sqlite` | Plugin-owned SQLite file, relative to the DSH working directory |
| `journalMode` | `wal` | `wal`, `delete`, `truncate`, or `persist` |
| `collectionIntervalMinutes` | `10` | Automatic collection interval in positive integer minutes |
| `itemsPerPlatform` | `30` | Maximum items processed per source per run, from 1 to 100 |
| `historyEnabled` | `true` | Whether to retain ranking and popularity observations for each run |
| `historyRetentionDays` | `30` | History retention period; `0` disables automatic cleanup |
| `requestTimeoutSeconds` | `15` | Per-request timeout from 1 to 120 seconds |
| `userAgent` | `dsh-topic-desk/0.1 ...` | User-Agent sent to source endpoints |
| `proxyUrl` | `http://127.0.0.1:7897` | HTTP(S) proxy for source requests; leave empty to disable |
| `sources.*.enabled` | `true` | Whether an individual source is enabled |
| `sources.*.feedUrl` | Built-in endpoint | Optional HTTP(S) mirror or test endpoint override |

See [`src/config.ts`](./src/config.ts) for the complete Schemastery definition. The database location, collection interval, item limit, history policy, and request behavior are configurable. The deduplication algorithm version is intentionally fixed to prevent identity drift within an existing database.

### Network behavior

- Uses `proxyUrl` first, then retries directly when the proxy has a connection-level failure.
- If no proxy is running locally, leave `proxyUrl` empty to use direct connections only.
- Records HTTP and parsing failures independently per source without aborting the whole run.
- Tries the configured first-party endpoint for 36Kr, Xueqiu, and Zhihu before using the built-in public fallback.
- A failed run never removes topics saved by the source's previous successful run.

### Local data and privacy

- Stores platform-stable IDs, titles, original URLs, publication times, rankings, optional popularity values, collection runs, and ranking observations.
- Does not collect article bodies, account credentials, browser history, or chat content.
- The Client only accesses the generated Remote API; all source requests and SQLite access stay in the Host.
- `.gitignore` excludes `data/` runtime data, SQLite auxiliary files, logs, build output, and local environment files.
- Ranking observations are retained for 30 days by default. Set `historyRetentionDays` to `0` to disable automatic history cleanup.

## Database and deduplication

The schema in [`db/schema.sql`](./db/schema.sql) is copied to `lib/schema.sql` during the build. It defines four business tables:

- `platform`: configured sources and their health state.
- `collection_run`: status and counts for each per-source collection run.
- `topic`: the latest persisted state of each deduplicated topic.
- `topic_observation`: ranking and popularity observations used for historical trends.

Every table contains these common fields:

```sql
id          INTEGER PRIMARY KEY,
deleted     INTEGER NOT NULL DEFAULT 0,
create_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
update_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
```

By project convention, the schema does not use `CHECK` or `FOREIGN KEY`. Repository transactions maintain relationships, while configuration, parsing, and persistence boundaries validate enums, ranges, and URLs.

Topic identity uses the following priority:

1. Platform-stable ID
2. Normalized URL
3. Normalized title

The SHA-256 digest input is fixed as:

```text
v1\0<platform_code>\0<identity_kind>\0<normalized_identity>
```

Rank, popularity, and collection time are not included in the digest. The database stores both the binary digest and an auditable `source_key`. After matching `(platform_id, dedupe_hash)`, the repository compares the source key and identity type again; a mismatch reports a collision instead of overwriting an existing topic.

Duplicate topics keep their original `title`, `canonical_url`, `published_time`, and `create_time`. Only the current rank, popularity, last collection run, deletion state, and update time change. When history is enabled, every successful match adds a `topic_observation` used to calculate real trends, rank changes, and consecutive appearance counts.

## Command reference

`.nvmrc` pins Node.js 24.19.0 and `package.json` pins pnpm 11. Run all commands from the repository root after `nvm use`.

| Command | Purpose |
|---|---|
| `pnpm typecheck` | Compile strict Host/Client TypeScript contracts and regenerate Typert metadata |
| `pnpm test` | Run deterministic Host, repository, parser, and UI tests without public network access |
| `pnpm build` | Produce Host/Client bundles, declarations, Remote artifacts, source maps, and the packaged schema |
| `pnpm demo:collect -- <path>` | Run live collection for every enabled source using an explicit SQLite path |
| `pnpm pack` | Create an installable plugin archive |

## Live collection demo

Run live collection with an explicit database path:

```bash
pnpm demo:collect -- /tmp/topic-desk.sqlite
```

Without a path, the command writes to `./data/topic-desk.sqlite`. Running it twice against the same path should keep the total topic count stable, increase `consecutiveRuns` from 1 to 2, and produce two real trend points.

## Troubleshooting

| Symptom | What to check |
|---|---|
| A category has no data | Check the region filter first. Filters intersect; for example, all current Developer sources are international. |
| Every international source fails | Check the service configured by `proxyUrl`, or leave it empty to use direct connections only. |
| One platform reports a failure | Inspect Host logs or the latest `collection_run`, then check its endpoint override and availability. Other platforms continue collecting. |
| Data is not updating | Click “Collect now,” then inspect the latest `collection_run` and `collectionIntervalMinutes`. |
| The database file cannot be found | Relative `databasePath` values use the DSH process working directory. An absolute path is also supported. |
| Build output is stale | Run `nvm use`, then `pnpm typecheck`, `pnpm test`, and `pnpm build`. Do not edit `lib/` directly. |

## Install in DeepSeek Harness

Build and pack the plugin, then add the archive to the target profile:

```bash
pnpm build
pnpm pack
dsh plugin --profile <your-profile> add ./dsh-topic-desk-plugin-0.1.0.tgz
```

The package includes `cordis.patch.yml`. Its Host plugin ID is `topic-desk`, and DSH discovers the Client entry through `dsh.client`. After the profile starts, Topic Desk appears in the sidebar. List data always comes from local SQLite; only scheduled collection and “Collect now” access source endpoints.

## Build notes

`@deepseek-ai/dsh-typert-generator@0.1.5-rc.1` only discovers protocol metadata from packages inside the workspace scan scope. This repository keeps the real plugin at the root and uses the private, unpublished `packages/_build/typert-protocol` bridge plus a disposable build-time workspace mirror. The bridge forwards to the official rc.2 runtime, while the published package continues to declare `@deepseek-ai/dsh-typert-protocol` as a peer dependency.

The plugin does not depend on a neighboring `deepseek-harness` source checkout.

## License

[MIT](./LICENSE)
