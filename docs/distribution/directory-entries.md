# Mastermind Council: directory and registry entries, ready to paste

Prepared 2026-10-30. Nothing has been submitted, signed up for, or paid. This file builds on
`mcp-directories.md` (27 Oct research) and replaces its listing text where the two differ.

## Facts checked 2026-10-30 (read-only)

- `POST https://llm.dravec.org/mcp` with no token: 401, `WWW-Authenticate: Bearer realm="OAuth", resource_metadata=".../.well-known/oauth-protected-resource/mcp"`.
- Authorization-server metadata: authorize, token, `registration_endpoint` (DCR), PKCE S256, auth method `none` allowed, `client_id_metadata_document_supported: false` (no CIMD).
- `https://dravec.org/.well-known/mcp-registry-auth`: 404. `https://llm.dravec.org/.well-known/mcp/server-card.json`: 404.
- Live (200, own pages): `/on/`, `/advisers/`, `/how-it-works/`. `/privacy` is a route in the app, public before the beta door.
- **There is no Terms of Service page.** `/terms` returns the app shell (SPA fallback), not a terms page. ChatGPT needs one.
- `https://github.com/Chartres/council` answers 200 (public). It holds the web client, not the MCP server (the server is in `flywheel/gateway/`).
- Verified quote lines: **365** (length of `src/content/verified-quotes.json`).
- Registry search for `dravec`: no entries yet.

## Shared text (used by several entries)

**Name:** `Mastermind Council`

**Short line A** (161 chars):
`Think through a decision with AI advisers modelled on Seneca, Socrates and other classics. Quotes are checked against public-domain texts. Free, in private beta.`

**Long description L** (1,557 chars; fits every 2,000 limit):

> Mastermind Council runs a short, facilitated session on a decision you are facing. A neutral facilitator brings in up to four AI advisers modelled on historical thinkers. The Classics roster is Seneca, Marcus Aurelius, Socrates, Confucius, Benjamin Franklin, the Buddha and Maria Montessori. The Business roster has simulations inspired by Peter Drucker, Steve Jobs and Andy Grove, with Socrates. The advisers are AI simulations, not the historical people, and are not endorsed by them or their estates.
>
> Quotes are checked. Each Classics adviser draws on named public-domain editions: Gummere's Seneca, Long's Marcus Aurelius, Jowett's Plato, Legge's Analects, Müller's Dhammapada and Sujato's suttas, Anne E. George's Montessori, and Franklin's Autobiography and Way to Wealth. A quotation is matched against the source passages before it is shown. If it cannot be found, it is removed. 365 verified lines are published by topic at https://council.dravec.org/on/ and can be read without an account.
>
> Each session ends in a journal entry: the decision, the reasoning, the assumptions, one next action, and optionally a dated commitment with an email reminder if you are signed in. The next session opens with what you decided last time.
>
> The app is in private beta and asks for a password. The reading pages are public. It is free and there is no paid plan. Not medical, legal or financial advice. Not affiliated with any Montessori organisation. The same council is offered as a remote MCP server with OAuth sign-in by email at https://llm.dravec.org/mcp.

**URLs**
- Site: https://council.dravec.org
- MCP endpoint: https://llm.dravec.org/mcp (streamable-http, OAuth 2.1 with DCR)
- Repo (web client): https://github.com/Chartres/council
- Privacy: https://council.dravec.org/privacy
- Docs / how it works: https://council.dravec.org/how-it-works/
- Reading pages: https://council.dravec.org/on/ and https://council.dravec.org/advisers/
- Support: council@dravec.org
- Images: `public/og.png` (1200x630, served at https://council.dravec.org/og.png), `public/favicon.svg` (served at https://council.dravec.org/favicon.svg). No square PNG logo exists yet; several forms want one (see each entry).

**Tags:** decision-making, journaling, stoicism, philosophy, ai-advisers, mcp

---

## 1. Official MCP Registry

- Route: `mcp-publisher` CLI (`brew install mcp-publisher`, then `login`, `publish`; `validate` checks without publishing). Quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx, checked 2026-10-30.
- Terms: free, metadata only, still "preview" ("breaking changes or data resets may occur"). No account if DNS or HTTP auth is used. Namespace proof: DNS TXT `v=MCPv1; k=ed25519; p=<key>` on the **apex** `dravec.org`, or `https://dravec.org/.well-known/mcp-registry-auth` (200, no redirects, 10 s timeout). GitHub login only gives `io.github.<user>/*`; an org namespace needs owner role plus a PAT or Actions OIDC (issue #1468). Auth doc: https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/authentication.mdx, checked 2026-10-30. Only `_meta` key `io.modelcontextprotocol.registry/publisher-provided` is kept (4 KB). No stated rule on beta servers. One remote URL can belong to one server name only (27 Oct note).
- Entry: `docs/distribution/server.json`, unchanged. **It validates against the current schema** (`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`, checked 2026-10-30 with jsonschema). That is still the released schema; the newest live entries (Sept 2026) use it, and the draft only adds template-variable URLs. Description is 99 of 100 chars.
- Optional additions (also validate; not applied):
  - `"icons": [{"src": "https://council.dravec.org/favicon.svg", "mimeType": "image/svg+xml", "sizes": ["any"]}]`
  - `"repository": {"url": "https://github.com/Chartres/council", "source": "github"}`: only if Pavol is fine pointing at the web client; the server source is not public. I would leave it out.
- Needed before publish: the TXT record (or the well-known file), which does not exist yet. Publish once MCP sign-in works for a stranger (see "Could not verify").
- auto_ok: **yes**, once Pavol has added the TXT record and stored the private key as a secret. Then it is a CLI call with no account and no terms in his name, and it only states facts already in server.json.

## 2. PulseMCP

- Route: none. https://www.pulsemcp.com/submit, checked 2026-10-30: "We are not accepting new MCP server or client submissions right now." It will pick up servers from the Official MCP Registry when it reopens. No date.
- Entry: none needed. The registry entry is the PulseMCP entry.
- auto_ok: **yes** (nothing to submit).

## 3. Glama (Connectors)

- Route: https://glama.ai/mcp/connectors → Add Server → Connector. FAQ: https://glama.ai/mcp/faq, checked 2026-10-30.
- Terms: no fee stated. Sign-in needed to claim; the page does not say whether submitting needs one (assume yes). URL must be HTTPS and streamable-http. DCR means no test credentials needed. "Only healthy connectors are indexed for search." Public by default. Registry-linked connectors take name, description and URL from the registry unless "Use Glama listing details as the source of truth" is set. Claim via TXT at `_glama-claim.dravec.org` or `https://dravec.org/.well-known/glama.json`.
- Better order: publish to the registry first, wait for Glama to ingest it, then only claim.
- Entry:
  - Name: `Mastermind Council`
  - Short description (no limit stated; 292 chars): `Think through a decision with AI advisers modelled on Seneca, Marcus Aurelius, Socrates and other classics. The advisers are AI simulations. Quotes are checked against public-domain translations; unverifiable ones are removed. Ends in a journal entry with one next action. Free, private beta.`
  - Server URL: `https://llm.dravec.org/mcp`
  - Test credentials: none (DCR)
  - Auth profile: OAuth 2.0
  - Category (set on Glama after claiming): Productivity
- auto_ok: **no** (Glama account in Pavol's name; the claim emails him).

## 4. Smithery

- Route: https://smithery.ai/new (redirects to sign-in), or `smithery mcp publish "https://llm.dravec.org/mcp" -n @<namespace>/council`. Docs: https://smithery.ai/docs/build/publish, checked 2026-10-30.
- Terms: no fee stated in the docs. Account and namespace needed. Needs 401 (we have it). Scans tools; for auth-walled servers it asks you to sign in to finish the scan, or reads `/.well-known/mcp/server-card.json`. Scan traffic uses UA `SmitheryBot/1.0` from Cloudflare Workers.
- **Blocker still open:** Smithery registers its OAuth client via CIMD; our server says `client_id_metadata_document_supported: false` (checked today). Test the connect flow before listing, or add CIMD, or ship a server card.
- Entry:
  - Display name: `Mastermind Council`
  - Description: text L.
  - Homepage: `https://council.dravec.org`
  - Icon: `public/favicon.svg`
- auto_ok: **no** (Smithery account in Pavol's name; the scan needs a real sign-in).

## 5. mcp.so

- Route: https://mcp.so/submit, checked 2026-10-30. Type: Remote Server. Fields: Repository URL (required), Name.
- Terms: "$39 one-time publishing fee" for instant publishing. A free reviewed path is implied ("faster review" for premium) but not spelled out. Sign-in link in the header; unclear if required.
- Entry: Type `Remote Server`; Name `Mastermind Council`; Repository URL `https://github.com/Chartres/council`; description text A; config if asked: `{ "mcpServers": { "mastermind-council": { "type": "streamable-http", "url": "https://llm.dravec.org/mcp" } } }`.
- Note: the required "Repository URL" is the web client, not the server. Say so if there is a description field.
- auto_ok: **no** (free path unclear, likely sign-in, and the only obvious button is "Pay and submit").

## 6. mcpservers.org (added)

- Route: https://mcpservers.org/submit, checked 2026-10-30. Web form.
- Terms: Free plan ($0, about two weeks review) or $39 premium. Choose Free. Account not mentioned. Has a "supports remote connection" checkbox and an optional Official Registry name field.
- Entry:
  - Server Name: `Mastermind Council`
  - Category: Other (no Productivity option seen; pick it if present)
  - Short Description: text A (161 chars; no limit stated)
  - Link: `https://council.dravec.org/how-it-works/`
  - Official MCP Registry Name: `org.dravec/council` (only after it is published)
  - Remote connection: checked
  - Contact Email: `council@dravec.org`
  - Plan: Free
- auto_ok: **yes**, after the registry entry exists and the beta question is settled. No account, no payment, product facts only, the product's own contact address.

## 7. awesome-remote-mcp-servers (jaw9c)

- Route: fork, add a table row, open a PR. https://github.com/jaw9c/awesome-remote-mcp-servers, checked 2026-10-30.
- Terms: free. OAuth only. Prefers servers "maintained by their underlying companies", "production ready", with "a track record of uptime". A solo private beta will likely be declined. Wait until the beta is open and has run for a while. Plain `OAuth2.1` (the 🔐 label is for servers without DCR).
- Entry (category "Productivity" exists in the list; keep alphabetical order):
  ```
  | Mastermind Council | Productivity | `https://llm.dravec.org/mcp` | OAuth2.1 | [Pavol Dravecký](https://council.dravec.org) |
  ```
- auto_ok: **no** (a public PR from Pavol's GitHub account). The punkpeye list stays out: it takes self-hosted servers with public repos only (27 Oct note).

## 8. Claude Connectors Directory (Anthropic)

- Route: https://claude.ai/directory/manage → Submit new → MCP connector. Docs: https://claude.com/docs/connectors/building/submission and https://claude.com/docs/directory/publish.md, checked 2026-10-30. Policy: https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy, checked 2026-10-30.
- Terms: Pro, Max, Team or Enterprise plan (free accounts cannot submit). No fee stated. Submitter agrees to the Software Directory Terms and Policy and seven compliance acknowledgements. Every tool needs `title` and `readOnlyHint` or `destructiveHint`. Test in Claude as a custom connector first. Policy 3D: "a standard testing account with sample data"; 3E: at least three working example prompts; 2B: descriptions "must precisely match actual functionality"; 1G: must not "persistently store or use conversation content to build user profiles" (the journal and "Last time" memory store what the user accepts; describe it plainly in data handling). Auto scan, then listed as Community by default; some get a human review. No stated rule on beta.
- Blockers: reviewer access past the beta password and past email sign-in (needs a reviewer mailbox or a password-style test login); tool annotations not checked here.
- Entry:
  - Server name (≤100; 18): `Mastermind Council`
  - One-liner (≤200; 161): text A
  - Description (≤2000; 1,557): text L
  - Categories (1 to 5): Productivity; Education (or closest)
  - Documentation URL: `https://council.dravec.org/how-it-works/`
  - Privacy policy URL: `https://council.dravec.org/privacy`
  - Support contact: `council@dravec.org`
  - Icon: `public/favicon.svg` (export a square PNG if SVG is refused)
  - URL slug (permanent): `mastermind-council`
  - Use cases: think through a personal or work decision; hear several viewpoints on one choice; keep a decision journal with a dated next action.
  - What users need: an email address to sign in (and, during the beta, the beta password if MCP sign-in asks for it; confirm).
  - Reads/writes: both (reads past journal entries, writes journal entries and commitments).
  - Company: Pavol Dravecký, https://council.dravec.org, council@dravec.org
  - Authentication: Required; OAuth with dynamic client registration.
  - Data handling: own API (the founder's gateway); no personal health data; no sponsored content.
  - Example prompts (3): `Convene the council: should I take the job offer in Prague or stay where I am?` / `Ask Seneca and Marcus Aurelius how to think about a decision I keep putting off.` / `Run a business council on whether to cut our product scope before launch.`
- auto_ok: **no** (Pavol's paid claude.ai account, terms acceptance in his name, reviewer credentials).

## 9. ChatGPT apps (submitted as plugins)

- Route: https://platform.openai.com/plugins → Upload new or existing plugin (ZIP) → Submit for review. Docs: https://developers.openai.com/apps-sdk/deploy/submission and https://developers.openai.com/apps-sdk/app-submission-guidelines, checked 2026-10-30.
- Terms: no fee stated. Organisation owner submits. Individual or business identity verification. Website, support, privacy and **terms of service** URLs, all HTTPS and same publisher. Test account that works "without MFA approval, email or SMS codes, magic links". 5 positive and 3 negative test cases. A demo video URL. Guidelines: "Trial or demo plugins will not be accepted"; must suit users aged 13 to 17; no impersonation ("misleading or copycat designs, impersonation"). A private beta may count as "trial"; the personas must stay clearly framed as AI simulations.
- Blockers: no ToS page; email-only sign-in fails the test-account rule; identity verification; demo video; private beta.
- Entry (manifest):
  - name: `mastermind-council`
  - displayName (≤30; 18): `Mastermind Council`
  - shortDescription (≤30; 28): `Decide with classic advisers`
  - longDescription (≤4000; 1,557): text L
  - developerName (≤80): `Pavol Dravecký`
  - category: Productivity
  - logo: square PNG, at least 48x48 (to make from `public/favicon.svg`)
  - websiteURL `https://council.dravec.org`; supportURL `mailto:council@dravec.org` or a contact page; privacyPolicyURL `https://council.dravec.org/privacy`; termsOfServiceURL: **missing**
  - Test cases: positive: start a Classics session; start a Business session; ask for a verified quote on fear; finish a session to a journal entry; set a dated commitment. Negative: `What's the weather in Brno?`, `Write me Python code`, `Book a flight` (expected: the council does not act).
- auto_ok: **no** (identity verification, terms in his name, demo video, reviewer login).

## 10. Product Hunt

- Route: sign in → Submit → New Product. https://www.producthunt.com/launch and https://help.producthunt.com/en/articles/479557-how-to-post-a-product, checked 2026-10-30.
- Terms: free ("100% free to use"). Personal account only; company accounts prohibited. No upvote asking. Description ≤260. Gallery needs 2+ images (1270x760 recommended). Thumbnail square, 240x240. A Status option for products "not available yet". Tagline limit not stated on either page; 60 is the common figure (secondary).
- Entry:
  - Name: `Mastermind Council`
  - Tagline (≤60; 57): `Think a decision through with Seneca, Socrates and others`
  - Description (≤260; 245): `AI advisers modelled on Stoics and classics talk through your decision, led by a neutral facilitator. Quotes are checked against public-domain source texts; unverifiable ones are removed. Each session ends in a journal entry and one next action.`
  - Links: `https://council.dravec.org`
  - Pricing: Free
  - Topics: Productivity, Artificial Intelligence, Journaling
  - Thumbnail: square from `public/favicon.svg`; gallery: `public/og.png` plus screenshots to make (roster, verified quote, journal entry, an `/on/fear/` page)
  - Maker comment: `community-drafts.md` §9 (still accurate; 365 lines confirmed).
- When: after the beta opens. One launch day; don't spend it behind a password.
- auto_ok: **no** (personal account, public post).

## 11. AlternativeTo

- Route: sign in → user menu → Suggest new application. https://alternativeto.net/faq/ **could not be fetched** (403, checked 2026-10-30). Falling back to the 27 Oct note plus a third-party guide seen today (https://saascity.io/directories/alternativeto): free with an account and verified email, optional ~$5 priority review (skip), manual review, **unreleased products not accepted**, thin AI wrappers rejected.
- Entry:
  - Name: `Mastermind Council`
  - Platforms: Web (Online). Licence: Free, Proprietary
  - Tags: decision-making, journaling, stoicism, philosophy, ai-assistant, mcp
  - Alternative to: SynthBoard and existing decision-journal apps on the site
  - Description: text L (lead with the quote checking, which is the non-wrapper part)
- When: after the beta opens.
- auto_ok: **no** (personal account).

## Skipped

- **toolmage.com:** skip. The submit page (https://www.toolmage.com/en/submit-you-ai/, checked 2026-10-30) now says "One-time submission fee for either method", $69, payment before review. This contradicts its own policy page, which still says free. Paid in practice.
- **mcpmarket.com:** skip for now. Free queue is 4 to 6 weeks, but the form wants the server's GitHub repo, and the server source is not public (https://mcpmarket.com/submit, checked 2026-10-30).
- **There's An AI For That:** skip, paid ($49+). Page 403 today; 27 Oct note.
- **topai.tools:** skip, paid ($47+). Page 403 today; 27 Oct note.
- **Futurepedia:** skip, paid ($247+). Page 404 today; 27 Oct note.
- **punkpeye/awesome-mcp-servers:** skip, self-hosted servers with public code only.

## Summary

| Target | Route | Free | auto_ok | When |
|---|---|---|---|---|
| Official MCP Registry | `mcp-publisher publish` | yes | yes (after TXT + key secret) | when MCP sign-in works for strangers |
| PulseMCP | via registry | yes | yes (nothing to do) | paused |
| Glama | web, Add Server → Connector | yes | no | after registry |
| Smithery | smithery.ai/new or CLI | yes | no | after CIMD test |
| mcp.so | web form | unclear | no | if free path shows |
| mcpservers.org | web form, Free plan | yes | yes | after registry |
| awesome-remote-mcp-servers | GitHub PR | yes | no | after beta has run a while |
| Claude Connectors Directory | claude.ai/directory/manage | needs paid plan | no | after reviewer access + annotations |
| ChatGPT apps | platform.openai.com/plugins | yes | no | last (ToS, test login, video) |
| Product Hunt | producthunt.com Submit | yes | no | after beta opens |
| AlternativeTo | Suggest new application | yes | no | after beta opens |

## Could not verify

- Whether MCP OAuth sign-in also asks for the beta password. If it does, every MCP listing leads to a dead end today.
- The MCP tool names and whether each has `title` and `readOnlyHint`/`destructiveHint` (Claude requires this). I did not sign in.
- AlternativeTo's own rules (403); the "no unreleased products" point is secondary.
- Whether Glama, mcp.so and mcpservers.org require an account to submit (pages don't say).
- Product Hunt's tagline limit (60 is secondary).
- Whether "Chartres" is a GitHub user or organisation (the GitHub API is blocked here).

## Policy proposal (for Pavol to confirm)

An agent may submit on its own only where the submission is metadata about the product, made with a key or address the product already owns (the dravec.org DNS key, council@dravec.org), with no account, payment, identity check or terms accepted in your name, and where the text says nothing beyond what is live and already in this file: today that means publishing and updating `server.json` in the Official MCP Registry, and the free mcpservers.org form, and even those wait until a stranger can sign in to the MCP server without the beta password. Everything else you submit yourself: anything that needs your personal account (Glama, Smithery, mcp.so, AlternativeTo, Product Hunt), anything public under your name (GitHub PRs, launch posts), anything that needs a paid plan, identity verification, reviewer credentials or a legal acknowledgement (Claude directory, ChatGPT), and anything with a fee, which we skip. The agent prepares those entries and tells you when the blocker for each one is gone.
