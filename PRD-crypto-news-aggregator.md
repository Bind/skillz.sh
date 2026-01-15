# Product Requirements Document: Crypto News Data Collection

## Overview

Collect crypto news articles from major publications via RSS feeds. Store articles with metadata for later use.

## Goals

1. Fetch news from 9 crypto publications via RSS
2. Retrieve full article content when possible
3. Store everything in a database
4. Run every 15 minutes

## Non-Goals

- Filtering or ranking articles
- Generating summaries
- Building an API
- Market data (prices, funding rates)

---

## News Sources

### Tier 1: Full Content in RSS

These give us complete articles directly in the RSS feed. No extra fetching needed.

| Source           | RSS URL                    |
| ---------------- | -------------------------- |
| Messari          | `messari.io/rss`           |
| CryptoSlate      | `cryptoslate.com/feed/`    |
| Bitcoin Magazine | `bitcoinmagazine.com/feed` |

### Tier 2: RSS + URL Fetch

These only have excerpts in RSS. We need to fetch the full article from the URL.

| Source        | RSS URL                 |
| ------------- | ----------------------- |
| Cointelegraph | `cointelegraph.com/rss` |
| Decrypt       | `decrypt.co/feed`       |
| Blockworks    | `blockworks.co/feed`    |
| The Defiant   | `thedefiant.io/feed`    |

### Tier 3: Special Handling

These are blocked or require JavaScript rendering. Defer for now.

| Source    | RSS URL                               | Problem                         |
| --------- | ------------------------------------- | ------------------------------- |
| CoinDesk  | `coindesk.com/arc/outboundfeeds/rss/` | Pages need JavaScript to render |
| The Block | `theblock.co/rss.xml`                 | Cloudflare blocks direct access |

### Excluded

| Source    | Why         |
| --------- | ----------- |
| Unchained | Paywalled   |
| DL News   | No RSS feed |

---

## What We Store

For each article:

| Field              | Description                 |
| ------------------ | --------------------------- |
| `id`               | Hash of URL                 |
| `url`              | Link to original article    |
| `title`            | Headline                    |
| `source`           | Publication name            |
| `published_at`     | When article was published  |
| `fetched_at`       | When we grabbed it          |
| `content_html`     | Full HTML (if we got it)    |
| `content_text`     | Plain text version          |
| `excerpt`          | RSS summary                 |
| `author`           | Author name                 |
| `categories`       | Tags from RSS               |
| `retrieval_tier`   | 1, 2, or 3                  |
| `retrieval_status` | success, partial, or failed |

---

## How We Fetch

**Tier 1**: Pull `content:encoded` from RSS.

**Tier 2**: Get metadata from RSS, then HTTP GET the article URL and parse the HTML.

**Tier 3**: Just store the RSS metadata for now. Skip full content until we figure out the browser/proxy situation.

---

## Schedule

| What                | How Often            |
| ------------------- | -------------------- |
| Poll RSS feeds      | Every 15 minutes     |
| Fetch full articles | When we see new ones |
| Retry failures      | Hourly, max 3 tries  |

---

## Success Looks Like

- Getting data from at least 7 of 9 sources each run
- Full content for 80%+ of Tier 1 and Tier 2 articles
- System stays up
- Articles show up within 30 minutes of being published

---

## Open Questions

### The Block (Cloudflare blocking)

We can't fetch The Block directly. Options:

1. **Wayback Machine**: Articles might be hours old and not everything gets archived
2. **Partnership**: Ask The Block for direct access
3. **Skip it?**

### CoinDesk (JavaScript rendering)

Their pages need a browser to load. Options:

1. **Run our own browser**: Puppeteer/Playwright. Works but adds complexity
2. **Use a service**: Browserless, ScrapingBee, etc. Costs money per request
3. **Skip it**: Just use the RSS excerpt

For now: Store RSS metadata and excerpt only. See if that's good enough before adding browser infrastructure.

---

## Source Summary

| Source           | What We Get   | How                 |
| ---------------- | ------------- | ------------------- |
| Messari          | Full articles | RSS only            |
| CryptoSlate      | Full articles | RSS only            |
| Bitcoin Magazine | Full articles | RSS only            |
| Cointelegraph    | Full articles | RSS + fetch URL     |
| Decrypt          | Full articles | RSS + fetch URL     |
| Blockworks       | Full articles | RSS + fetch URL     |
| The Defiant      | Full articles | RSS + fetch URL     |
| CoinDesk         | Excerpt only  | RSS only (deferred) |
| The Block        | Metadata only | RSS only (deferred) |

---
