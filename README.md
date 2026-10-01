# Shishō 師匠

**Find your shishō. Follow a strategy you can check.**

A strategy marketplace for RYO-CHAN. Traders publish their strategy as exact rules. An agent runs every rule each hour on RYO-CHAN's live research tools, records each practice trade with the evidence behind it, and lets a Bull, a Bear and a Judge argue before any trade is taken. Anyone can replay any decision from its stored evidence. Followers choose the shishō whose record they trust, pay in RYO-CHAN, and tip after a good trade.

RYO-CHAN Hackathon 2026 · **Track 1 · Autonomous Agents** and **Track 2 · Dashboards & Interfaces**

- **Live:** https://shisho-rho.vercel.app (rebuilt from the agent's records every hour)
- **Public mirror of this repo:** https://github.com/imprint-hash/shisho
- **Practice only.** Shishō never places a real trade and never moves tokens. Payments are wallet-signed promises that settle when RYO-CHAN launches on RYO's DEX.

---

## The problem

Most people who want to trade crypto don't have a strategy; they follow someone who seems to. Today that means a screenshot of a winning trade, a tip in a group chat, or a "copy" button with no way to see why the trader did anything. The good calls get posted. The bad ones get deleted. The follower can't check either.

Strategies that live in someone's head can't be checked. Strategies written down as rules can.

## Who it's for

- **Creators (shishō):** traders who want to be paid for their method, and are willing to have it checked. They publish rules, stake RYO-CHAN behind them, and earn follow fees and tips.
- **To become a shishō, you must stake RYO-CHAN.** No stake, no listing. The stake is your promise that the agent will follow your rules exactly; break them and followers are paid from it.
- **Followers:** RYO's newcomers and retail users who want to learn from someone better, and need to see *why* a trade was made before paying to follow it.

## What it does

1. **A shishō publishes rules in plain English.** "Buy Solana or Avalanche when the market is fearful and they're oversold. Sell after a 10% bounce or cut at 5%." A model turns the words into exact rules, using only fields RYO's tools return; Shishō's own code validates every field before anything can run. The creator stakes RYO-CHAN as a bond.
2. **An agent trades every strategy, hourly, in practice.** It reads the market once through RYO-CHAN's tools, checks each strategy's rules in code, and records every decision (buy, sell, stand aside, no entry) with every RYO answer it used, fingerprinted.
3. **A council weighs every trade the rules allow.** A Bull argues for it and a Bear against it, from the same evidence: the rule checks, RYO's deep analysis (confluence, catalysts, risks, derivatives) and a side-by-side comparison with Bitcoin. A Judge decides take, half or skip. The Judge can only shrink or veto a trade, never enlarge it, and every number any of them writes is checked against the evidence.
4. **Anyone can replay any decision.** Each one is rebuilt from its stored evidence and the stored version of the rules, with no network and no model, and must come out identical. A decision that doesn't match costs the shishō 10% of their stake, paid to followers.
5. **Followers follow, pay and tip.** Pay the follow fee in RYO-CHAN from a Solana wallet; tip after a good trade. Every payment is signed by the wallet and recorded in a ledger with its exact split.

## What happened on live data (29 Sep – 1 Oct 2026)

These are the agent's own records, in `data/`, from 15 hourly cycles on RYO's live tools:

- **77 decisions recorded. 48 replay identically from their stored evidence; 0 differ.** The other 29 (holding, watching, fully invested) have nothing to replay.
- **The council earned its place.** Before it existed, Calm Trend bought TIBBIR after a +45.16% day; the price fell through the stop while no one was checking and the practice trade closed at −32.6%. Since the council arrived it has refused ten trades the rules allowed and halved one, each for a stated reason drawn from RYO's evidence, for example: *"Skip: QNT's RSI of 79.5 and ATR of 12.24% versus Bitcoin's 2.66% show a stretched, much more volatile move after a 316.58% seven-day rise."*
- **Rotation Scout closed SOON at +15.83%** at its take-profit.
- **RYO's sentiment tool went down mid-run twice.** Strategies that needed it stood aside and said so ("funding and liquidation data were unavailable"); nothing was filled in.
- **RYO rate-limited the agent 27 times;** every call was retried and answered. The system health card on the site counts these.

Short-term profit isn't the point and isn't how the page sorts. The page leads with what changed this hour and whether each shishō kept its own rules.

## How it uses RYO-CHAN

All six research tools, combined into each decision rather than shown one at a time:

| Tool | What Shishō uses it for |
|---|---|
| `market_overview` | Market regime, Fear & Greed, breadth, BTC dominance for every strategy's market rules |
| `monitor_market_sentiment_shift` | Fear & Greed change, funding crowding, liquidation pressure, altseason phase |
| `scan_market` | Each scanning strategy's candidates, in RYO's order, with momentum score and turnover |
| `analyze_token` | Every candidate's price, trend, RSI, ATR and RYO's own read; marking open positions |
| `deep_analysis` | The council's evidence: confluence, catalysts, risks, derivatives posture |
| `compare_tokens` | The council's check of the candidate against Bitcoin |

RYO's numbers are read out of the stored answers by code, never retyped by a model.

## How it copes with failure

- **Rate limits.** The key allows 60 calls a minute, and RYO's fan-out tools allow 6. A sliding window keeps the agent under both; when RYO still says "Rate limit exceeded" (it answers in text, not with a 429), the call waits for the window and retries.
- **A tool goes down.** The call resolves as `unavailable` with RYO's reason. A strategy whose rules need that data stands aside and says which data was missing. A position RYO can't price stays open, unmarked, rather than being closed at a guess.
- **The network is gone.** Before each cycle the agent checks it can reach RYO; if not, it records nothing and the next attempt runs later, instead of logging an hour of failures.
- **Restarts.** Every book, decision and piece of evidence is on disk. A cycle that dies halfway is safe to rerun; a lock stops two cycles overlapping.
- **The model fails.** Notes fall back to a plain template built from the checks. A council that can't be reached, or a Judge whose answer cites a number the evidence doesn't contain, falls back to the rules.
- **A price jumps past a stop between checks.** The practice stop fills at the first price seen, and the record says so: the stop, the price it filled at, and the hours since the last check.

## Repeatability

Every RYO answer is stored whole under the SHA-256 of its canonical JSON (keys sorted at every level). Every decision stores the fingerprints of the answers it used and of the exact version of the strategy that made it. The council's whole debate is stored the same way. `npm run replay` rebuilds every decision from those files alone and reports any that differ.

## The marketplace, and what it earns RYO

| Payment | Split |
|---|---|
| **Follow fee** (set per shishō, e.g. 5,000,000 RYO-CHAN a month) | 70% to the shishō, 30% to RYO. RYONOMICS puts 20% of platform fee revenue into buying back and burning RYO-CHAN, so 6% of every fee is burned |
| **Tip** after a winning trade | 90% to the shishō, 10% to RYO (20% of that burned) |
| **Stake** to publish (10M – 200M RYO-CHAN) | Locked behind the strategy. Slashed 10% for every decision that breaks its own rules, paid to followers |

Every payment is signed by the payer's Solana wallet (Phantom) where one is connected, and recorded with its split. RYO-CHAN can't move until it lists on RYO's DEX, so each entry is a promise marked "settles at RYO-CHAN launch". The fees and stakes in the demo are simulated, and every screen says so.

## Honesty

- **Demo shishō.** Calm Trend, Rotation Scout, Steady Majors and Fear Buyer were written by the Shishō team to seed the marketplace. They are labelled DEMO everywhere. Their trades are real practice trades on live RYO data.
- **Practice only.** No real orders, no real token movements.
- **Payments are promises** until RYO-CHAN launches.
- **The hosted site is read-only.** Follows and payments made there are kept in the visitor's browser; publishing there previews the rules only. The agent's own records are the ones in this repo.

## Run it

Prerequisites: Node.js 20 or newer. No packages to install.

```bash
cp .env.example .env          # add RYO_API_KEY (ryo_mcp_...), and optionally an LLM endpoint
set -a; . ./.env; set +a
npm run cycle                 # one agent cycle over every strategy, on live RYO data
npm run replay                # rebuild every recorded decision from its evidence
npm start                     # the site on http://localhost:3200
npm test                      # 23 tests, offline, against a fake RYO
```

Environment variables: `RYO_API_KEY` (required for live data). `SHISHO_LLM_URL`, `SHISHO_LLM_KEY`, `SHISHO_LLM_MODEL`: any OpenAI-compatible chat endpoint for the council, the notes and plain-English publishing; without them, notes use the template and the rules decide alone. `SHISHO_DATA` moves the records folder.

The hourly agent runs on GitHub Actions in the public mirror (`.github/workflows/agent.yml`), with the keys stored as encrypted repository secrets.

## Tests

`npm test` runs 23 tests with no network and no keys, against a fake RYO that answers like the real MCP endpoint. They cover: buying a coin that passes every rule and fixing its exits; replaying every decision identically; catching a tampered decision; standing aside when the market is outside the rules; take-profit, stop-loss, time and percent exits; a stop that gaps; retrying a rate-limited tool and a server error; an honest "unavailable" when the network dies; standing aside when a market tool is down; holding a position RYO can't price; the council's take / half / skip sizes; overruling a Judge who invents a number; striking an argument with an invented number; storing the debate for replay; rule validation; plain-English labels; stable fingerprints; catching an invented number in a note; fee and tip splits; and payment validation.

## Layout

| Path | What it is |
|---|---|
| `src/ryo.js` | RYO-CHAN MCP client: rate windows, retries, honest "unavailable", reachability |
| `src/evidence.js` | Fingerprinted evidence store, and the facts read out of RYO's answers |
| `src/strategy.js` | Rule fields, checks, validation, plain-English labels |
| `src/engine.js` | The agent: exits, market rules, candidates, council, practice books |
| `src/council.js` | Bull, Bear and Judge, with number checks; the debate stored as evidence |
| `src/replay.js` | Rebuilds a decision from stored evidence and compares |
| `src/note.js` | Plain-English notes; any invented number sends it back to the template |
| `src/compile.js` | Plain English → validated rules |
| `src/market.js` | Follow fees, tips, stakes, slashing, the payments ledger |
| `src/record.js`, `src/api.js` | Track records, the "what changed" feed, system health |
| `bin/` | `run.mjs` (one cycle), `replay.mjs`, `serve.mjs`, `loop.sh`, `sync-ryo.sh` |
| `public/` | The site; `tako-sensei.svg` is the mascot |
| `data/` | Strategies, books, decisions, evidence, health and payments: the agent's real records |
| `test/` | The test suite and the fake RYO |

## Third-party code and services

No npm packages. Everything else used:

- **RYO-CHAN MCP research tools** (`app-ryochan.com/api/mcp`), the data foundation.
- **An OpenAI-compatible LLM endpoint** for the council, the notes and publishing: we used `gpt-6-luna` through OpenServ's SERV Reasoning API. Any compatible endpoint works.
- **Fonts:** Manrope, JetBrains Mono, Noto Sans JP and Noto Serif JP from Google Fonts.
- **Phantom wallet** browser API (`window.phantom.solana`) for signing payment promises.
- **GitHub Actions** (`actions/checkout`, `actions/setup-node`) for the hourly agent, and **Vercel** for hosting the public site.
- **Design references:** the layout follows two Dribbble shots chosen for this project (a forex trading dashboard and a copy-trading overview). The mascot, Tako Sensei, was drawn for Shishō.

## Limits

- Three days of live records is a short record; the demo strategies are seeds, not track records worth paying for yet.
- Hourly checks mean a stop can be overtaken by a fast move between checks (TIBBIR). Faster checks would cost more RYO calls.
- Payments, stakes and slashing are simulated until RYO-CHAN can move.
- Notes and the council use a hosted model; the decision itself is always made by code from RYO's evidence.

## Licence

[MIT](LICENSE)
