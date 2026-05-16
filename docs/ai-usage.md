# How AI was used in this project

The challenge brief says:

> _"How you use AI is part of what we're evaluating, not a side note."_

So here's the honest version, written by me, not the model.

## Tools

- **Claude Code** as the daily-driver pair.
- **GitHub** as the version-of-record.
- **MCP Inspector** + Claude Desktop as the smoke-test surface.

## What Claude Code did, what I did

| Area                                                | Mine                                                                                                              | Claude's                                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Architecture & scope**                            | Hybrid Python/TS, pre-ingestion vs request-time, shared `core/`, JSON-LD-first parser, provider abstraction.       | Sanity-checking decisions, naming bikesheds, pointing out edge cases.                                            |
| **Stack picks**                                     | `@modelcontextprotocol/sdk` 1.29.x, `better-sqlite3` + `sqlite-vec`, `commander`, `pino` (with stderr), `vitest`.   | Recall of recent best-practice patterns (stdout-kills-stdio, Streamable HTTP > SSE, `structuredContent` + Zod).   |
| **Schema design**                                   | The deal/category/location/merchant model, the right-padded 1536 vector slot, the unique-by-URL invariant.         | Drafting the `CREATE TABLE` statements and indices.                                                              |
| **Discovery**                                       | Decision to write a `discover_urls.py` once I hit a 404, decision to inspect a real deal page when titles were empty. | Implementing the inspection scripts.                                                                              |
| **Parser strategy**                                 | "Try JSON-LD first, data-testid second, OpenGraph third, DOM heuristics last."                                     | The actual cascade with `try`/`except` around each selector.                                                      |
| **Scoring**                                         | The four components, the weights, the renormalisation when price has no peer median.                              | The `Math.log10` choice for popularity, the boilerplate around `scoreDeal`.                                       |
| **Tests**                                           | Test plan: what counts as a sanity check, where the FK constraint will bite, what the InMemoryTransport pattern looks like. | Test code itself, refactored under my review.                                                                     |
| **Commits**                                         | Decision to keep granular commits, conventional-style messages, no `Co-Authored-By` (so reviewers see a normal-looking solo history). | Drafting commit bodies under my edit.                                                                             |
| **README + docs**                                   | Outline, voice, what to include vs cut, the Mermaid diagrams' content.                                            | Drafting prose under my edit.                                                                                     |

## Concrete examples

**The 404 round-trip.** My first scrape returned `/ofertas/madrid/belleza-y-relax → 404`. I'd guessed the URL structure based on what most marketplaces use. I asked Claude to help me write a `discover_urls.py` that fetched the home and analysed `<a>` patterns. The script told me the real pattern was `/ofertas/{slug}` (slug = city OR category, not city × category). I rewrote `seeds.json` and the parser. The round-trip took 15 minutes; without AI it'd have taken 30.

**The FK constraint test failure.** When I first ran the MCP integration test, vitest failed with `SqliteError: FOREIGN KEY constraint failed`. The error message was clear; I asked Claude to find which insert it was. We found it (the seed inserted a deal before its merchant). One-line fix. The lesson is mine: foreign keys exist for a reason and `INSERT OR IGNORE` doesn't paper over them.

**The token-cost asymmetry argument.** This was my framing, not Claude's. I've felt it in practice — MCP servers load schemas in every conversation, CLIs don't. Selling that as a Nodegraph-aligned point is a real product argument, and I wanted it in the README.

## What I did NOT use AI for

- Choosing the company-facing pitch (the README's "Why MCP and CLI" framing, the Nodegraph alignment story, the "deterministic-then-LLM" principle).
- Deciding to ship the take-home in ~8 hours with a committed sample dataset rather than chase volume. The 5-hour version would have been MCP + CLI + sample data; the extra hours went into a third interface (the web chat) and explicit trade-off docs — past the brief's 5-hour guideline by choice, documented in the README's "Time spent" section.
- Writing this `docs/ai-usage.md`. (I wrote this directly.)

## Verifying

The repo's git history is real. Every commit message reflects what actually got done, in the order it got done. No squash, no rebase-and-rewrite to look heroic. If a reviewer wants to confirm pace, the timestamps are honest.
