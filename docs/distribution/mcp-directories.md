# Mastermind Council: MCP registries, connector directories, AI-tool directories

Prepared 2026-10-27. Nothing has been submitted, published, or signed up for. Each step below is for Pavol to run.

> **Depends on #17 (2026-10-28).** Every mention of `/on/` pages and "365 verified lines" assumes the public reading pages, which wait for Pavol's pick (docs/SIGNATURE.md, Proposal: The classics on…). If he picks option 2 or 3, cut those sentences before posting.


## Endpoint facts checked on 2026-10-27 (read-only, no sign-in)

- `POST https://llm.dravec.org/mcp` without a token → **401** with `WWW-Authenticate: Bearer realm="OAuth", resource_metadata="https://llm.dravec.org/.well-known/oauth-protected-resource/mcp"`. Directories that auto-detect OAuth via RFC 9728 (Smithery, Claude) need exactly this: 401, not 403.
- Protected-resource metadata: `resource=https://llm.dravec.org/mcp`, `authorization_servers=["https://llm.dravec.org"]`, `resource_name="Mastermind council"`.
- Authorization-server metadata: authorize, token and **registration (DCR)** endpoints, PKCE `S256`, `token_endpoint_auth_methods` includes `none`, and **`client_id_metadata_document_supported: false`**. That last one matters for Smithery (see below).
- `https://dravec.org/.well-known/mcp-registry-auth` → 404 (not set up yet). No DNS check was possible (`dig` isn't installed here).
- Unknown and needs Pavol: whether MCP sign-in also hits the beta password, the five tool names, whether every tool has `title` + `readOnlyHint`/`destructiveHint` annotations (Claude requires this), whether `github.com/Chartres/council` is public, and whether "Chartres" is a GitHub user or an organisation.

## Summary

| Directory | Free? | Remote OAuth server accepted? | Blocker / status |
|---|---|---|---|
| Official MCP Registry | Yes | Yes (`remotes`, streamable-http) | Namespace proof: DNS TXT on dravec.org apex (Cloudflare), or HTTP well-known file, or `io.github.<user>` |
| Glama (connectors) | Listing appears free (no price stated). Account needed | Yes. DCR means no test creds needed | Must be "healthy" (reachable). Claim via DNS/GitHub |
| Smithery | Publishing fee not stated. Free plan exists | Yes, OAuth via RFC 9728 | Smithery registers via **CIMD**. Server says CIMD unsupported, so the scan or connect may fail until CIMD is added or Smithery falls back to DCR |
| PulseMCP | n/a | n/a | **Submissions paused**. Will pick up servers from the official registry when reopened |
| mcp.so | Paid $39 fast-track shown. A free reviewed path isn't confirmed on the page | Yes ("Remote Server" type) | Don't pay. Use the free path only if it exists |
| awesome-mcp-servers (punkpeye) | Free (PR) | **No**, only self-hosted servers with a public repo. Remote-only servers go to the list below | n/a |
| awesome-remote-mcp-servers (jaw9c) | Free (PR) | Yes, OAuth 2.0/2.1 only | Prefers "official", production-ready, established servers. A solo beta may be declined |
| Claude Connectors Directory | Free to submit, but needs **a paid Claude plan** | Yes | Needs a reviewer test account, privacy policy URL, docs URL, tool annotations, a beta that is open to reviewers |
| ChatGPT (apps → plugins portal) | Cost not stated | Yes (OAuth) | Identity verification. Reviewer login must work **without email codes or magic links** (email sign-in likely fails this). Demo video, ToS + privacy URLs, 5+3 test cases |

AI-tool directories (AIO baseline):

| Directory | Free listing? | Requirements | When |
|---|---|---|---|
| Product Hunt | Yes | Personal account, gallery of 2+ images, tagline ≈60 chars | After the beta opens (see community-drafts.md) |
| AlternativeTo | Yes (account + verified email). Optional ~$5 priority review (secondary source) | Platforms, licence, description, tags, alternatives. Secondary source says unreleased products aren't accepted | After the beta opens |
| There's An AI For That | **No** permanent free listing found ($49 website-only, $347 package). Only a free monthly X-thread giveaway | Paid form | Skip unless budget changes |
| topai.tools | **No** ($47 fast listing, $229 premium; refund if rejected) | Paid form, editorial review | Skip |
| Futurepedia | **No** on the official page ($247 basic, sold out; $497 verified). Competitor sites claim a free path, not confirmed | Paid form | Skip |
| toolmage.com | **Yes**, per submission policy (the submit page also shows a $69 option) | 13 fields: name, URL, category, tags, professions, pricing, short + detailed description (≥500 words recommended), logo, preview image(s) | After the beta opens ("valid and accessible URL") |

---

## 1. Official MCP Registry (registry.modelcontextprotocol.io)

**Sources (accessed 2026-10-27):**
- Quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- Authentication: https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/authentication.mdx
- Remote servers: https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/remote-servers.mdx
- Official requirements: https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/reference/server-json/official-registry-requirements.md
- Schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json. This is the current released schema. All entries published since 2026-09-01 that I sampled from the live API use it. The draft schema only adds template-variable URLs.

**Status:** preview ("breaking changes or data resets may occur"). Free. It stores metadata only. Aggregators (PulseMCP, Glama and others) build on it.

**Requirements:**
- `name` (required, 3–200 chars, pattern `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$`), `description` (required, **≤100 chars**), `version` (required). `title` ≤100 is optional, as are `websiteUrl`, `repository` and `icons`.
- Remote-only server: `remotes: [{ "type": "streamable-http", "url": ... }]`, no `packages`, so no package-ownership check. The URL must be publicly reachable. **Each remote URL can belong to only one server name.** Publish once, under the name you intend to keep.
- OAuth isn't declared in server.json. Clients discover it from the 401 + metadata, which already works. Use `headers` only for static API keys. Don't add any here.
- `_meta`: only `io.modelcontextprotocol.registry/publisher-provided` is kept, 4 KB max.
- The registry checks that you control the **namespace**, not the remote URL.

**Namespace choice (this is the blocker to decide):**

| Option | Name | Proof | Notes |
|---|---|---|---|
| A (recommended) | `org.dravec/council` | DNS TXT record on the **apex** `dravec.org` (not `_mcp-auth.dravec.org`), Ed25519 key | The name matches the URL's domain. One Cloudflare DNS edit. Works for all future products under dravec.org |
| B | `org.dravec/council` | HTTP: serve `https://dravec.org/.well-known/mcp-registry-auth` (plain text, 200, no redirects) | The registry fetches it from Google Cloud with UA `mcp-registry/1.0`. Cloudflare bot rules or redirects on dravec.org will break it. Currently 404 |
| C | `io.github.<pavol-username>/council` | `mcp-publisher login github` (device flow) | Personal namespace only. If `Chartres` is an **organisation**, `login github` can't publish to `io.github.Chartres/*` (issue #1468). That needs a PAT with `read:org` or GitHub Actions OIDC, and owner role |

**Steps (option A), for Pavol to run:**

```bash
# 1. Install the publisher
brew install mcp-publisher          # or download a release binary from github.com/modelcontextprotocol/registry/releases

# 2. Key + TXT record (needs OpenSSL 3; on macOS use brew's openssl@3)
openssl genpkey -algorithm Ed25519 -out key.pem   # keep key.pem out of any repo
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "dravec.org. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
#    -> add that TXT record in Cloudflare DNS at name "@" (apex), wait for propagation:
dig TXT dravec.org +short

# 3. Log in
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain dravec.org --private-key "${PRIVATE_KEY}"

# 4. Publish (from the folder holding server.json)
mcp-publisher publish

# 5. Verify
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=org.dravec/council"
```

**Timing:** the registry only requires the URL to be publicly reachable, and it is (401 + OAuth). Publishing during the beta is allowed. But anyone who connects and then hits a password wall gets a dead end. Publish once MCP sign-in works for anyone with an email address.

**Draft server.json** (also saved as `server.json` next to this file; validated against the 2025-12-11 schema; description is 99 chars):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "org.dravec/council",
  "title": "Mastermind Council",
  "description": "Think a decision through with AI advisers modelled on Stoics and classics; quotes checked vs source",
  "version": "0.1.0",
  "websiteUrl": "https://council.dravec.org",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://llm.dravec.org/mcp"
    }
  ]
}
```

Optional additions:
- `"repository": {"url": "https://github.com/Chartres/council", "source": "github"}`, only if that repo is public.
- `"icons": [{"src": "https://council.dravec.org/<icon>.png", "mimeType": "image/png", "sizes": ["96x96"]}]`.
- For option C, change `name` to `io.github.<username>/council`.

---

## 2. Glama

**Sources:** https://glama.ai/mcp/faq, https://glama.ai/mcp/servers (accessed 2026-10-27)

- Has a separate **Connectors** section for remote servers. Add flow: Connectors page → **Add MCP Server → Connector**, then name, short description and server URL. The URL "must be HTTPS and speak the `streamable-http` transport."
- Test credentials are optional. "If your server supports OAuth 2.1 dynamic client registration … Glama will register automatically." This server supports DCR.
- "Only healthy connectors are indexed for search." Connectors are "public by default." Glama links connectors to the official registry, so registry updates overwrite name, description and URL.
- Ownership claim: **Claim ownership** → DNS TXT at `_glama-claim.dravec.org`, or `https://dravec.org/.well-known/glama.json`, or GitHub for `io.github.*` names.
- Cost: none stated for listing. A Glama account is required.

**Steps:** sign in to Glama → Connectors → Add MCP Server → Connector → fill in the entry below → after it's live, Claim ownership via DNS. Better: publish to the official registry first and check whether Glama ingests it, then just claim it.

**Entry:**
- Name: `Mastermind Council`
- Short description: `Think through a decision with AI advisers modelled on Seneca, Marcus Aurelius, Socrates and other classics. Quotes are checked against public-domain translations; unverifiable ones are removed. Ends in a journal entry with one next action.`
- URL: `https://llm.dravec.org/mcp`

---

## 3. Smithery

**Source:** https://smithery.ai/docs/build/publish (accessed 2026-10-27)

- Steps: go to https://smithery.ai/new, enter the public HTTPS URL, and complete the flow. CLI alternative: `smithery mcp publish "https://llm.dravec.org/mcp" -n @<namespace>/council`.
- Requirements: Streamable HTTP. "OAuth support (if auth required)". Return 401 (not 403) when unauthenticated, which this server does. Smithery scans tools and prompts. For an auth-walled server it asks you to sign in to finish the scan. Otherwise you provide a static card at `/.well-known/mcp/server-card.json` (`serverInfo` with name and version, optional `tools`, `authentication`). If a WAF blocks it, allow UA `SmitheryBot/1.0`.
- **OAuth client registration:** "Smithery handles client registration automatically via Client ID Metadata Documents." The docs don't mention DCR, and the server advertises `client_id_metadata_document_supported: false`. **Possible blocker:** test the connect flow. If it fails, add CIMD support (accept a URL as `client_id` and fetch its metadata document) or ship the static server card.
- Cost: the docs state no publishing fee. Third-party pages list a Free plan plus paid tiers ($10/$25 a month). Use the free tier only.

**Entry:**
- Display name: `Mastermind Council`
- Description: `A facilitated decision session with AI advisers modelled on historical thinkers (Seneca, Marcus Aurelius, Socrates, Confucius, Franklin, the Buddha, Montessori; or a business roster inspired by Drucker, Jobs and Grove). Classic quotes are checked against one public-domain translation per thinker before they are shown. Unverifiable ones are removed. The session ends in a journal entry: decision, reasoning, assumptions, one next action, optional dated reminder. Sign-in: OAuth, email. Free beta.`
- Homepage: `https://council.dravec.org`

**Optional `/.well-known/mcp/server-card.json`** (only needed if the scan can't get past auth. Fill in the real tool names):

```json
{
  "serverInfo": { "name": "Mastermind Council", "version": "0.1.0" },
  "authentication": { "required": true, "schemes": ["oauth2"] },
  "tools": [
    { "name": "<tool_1>", "description": "<one line>" }
  ]
}
```

---

## 4. PulseMCP

**Source:** https://www.pulsemcp.com/submit (accessed 2026-10-27)

- "not accepting new MCP server or client submissions right now". It isn't making changes to existing listings either.
- Says servers published to the Official MCP Registry will be picked up automatically when it reopens.
- **Action:** none. Publish to the official registry (section 1). That is the PulseMCP submission.

---

## 5. mcp.so

**Source:** https://mcp.so/submit (accessed 2026-10-27)

- Form: type (MCP Server / **Remote Server** / MCP Client / AI Product), **Repository URL (required)**, Name.
- The page shows a "$39 one-time publishing fee" for instant publishing, a verified badge and a dofollow link. It implies unpaid submissions are reviewed, but doesn't spell out a free path or review time.
- The required "Repository URL" is a problem for a closed-source remote server. Use `https://council.dravec.org` or the public repo, if there is one.
- **Action:** submit only if the free option is visible in the form. Don't pay (the $0 rule). Pavol should check while signed in.

**Entry:**
- Type: Remote Server
- Name: `Mastermind Council`
- URL: `https://github.com/Chartres/council` if public, otherwise `https://council.dravec.org`
- Server config to paste if asked:
```json
{ "mcpServers": { "mastermind-council": { "type": "streamable-http", "url": "https://llm.dravec.org/mcp" } } }
```
- Description: same as the Smithery text.

---

## 6. awesome-mcp-servers lists

### punkpeye/awesome-mcp-servers
**Source:** https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md (accessed 2026-10-27)
- Scope: servers with a public GitHub repo that you "install and run yourself". **Remote-only servers belong in awesome-remote-mcp-servers.** So Mastermind Council doesn't qualify here unless the server code is public and self-hostable.
- Format: one server per line, name linked to the repo, short description, right category, alphabetical order. Agent-made PRs are asked to add 🤖🤖🤖 to the title (fast-tracked).

### jaw9c/awesome-remote-mcp-servers
**Source:** https://github.com/jaw9c/awesome-remote-mcp-servers (accessed 2026-10-27)
- Steps: fork → add a table row in the right category → PR (Pavol opens it, not me).
- Row columns: Name | Category | URL | Authentication | Maintainer. Example: `Airtable | Database | https://mcp.airtable.com/mcp | OAuth2.1 | [Airtable](https://airtable.com)`. OAuth 2.0 only. The "OAuth 2.1 🔐" label marks servers **without** DCR. This server has DCR, so plain `OAuth2.1`.
- Quality bar: official or vendor servers preferred, production-ready, actively maintained, proven uptime. A solo beta may get declined. Better to wait until the beta is open and has run for a while.

**Draft row:**
```
| Mastermind Council | Productivity | `https://llm.dravec.org/mcp` | OAuth2.1 | [Pavol Dravecký](https://council.dravec.org) |
```
(Use the list's existing category name if "Productivity" isn't one. Keep the alphabetical order.)

---

## 7. Claude Connectors Directory (Anthropic)

**Source:** https://claude.com/docs/connectors/building/submission (accessed 2026-10-27). Policy: https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy

- Portal: https://claude.ai/directory/manage → **Submit new** → **MCP connector**. Anyone on a **paid Claude plan** can submit (Pavol's Max plan qualifies). No fee is stated. No domain-ownership proof is required.
- Requirements: remote HTTPS server. OAuth 2.0 (DCR works, or give Anthropic a client ID and secret). **Every tool has `title` and `readOnlyHint` or `destructiveHint`.** Tested as a custom connector in Claude. Documentation URL, privacy policy URL, support contact, icon. **A test account for reviewers.** Seven compliance acknowledgements.
- After submission: an automated scan, and by default it's listed as a **Community** connector. Some submissions get a human review. Escalations: mcp-review@anthropic.com.
- Blockers before submitting: (1) the beta password must not block reviewers, so either open the beta or give reviewers working sign-in; (2) a privacy policy page and a docs/setup page on council.dravec.org; (3) tool annotations (check in the code); (4) reviewers must be able to sign in. If sign-in sends an email link, give a reviewer mailbox or another sign-in method.

**Listing fields:**
- Server name (≤100): `Mastermind Council`
- One-liner (≤200): `Think through a decision with AI advisers modelled on Seneca, Marcus Aurelius, Socrates and other classics, with quotes checked against public-domain source texts.`
- Description (≤2000):
> Mastermind Council runs a short, facilitated session on a decision you're facing. A neutral facilitator brings in AI advisers modelled on historical thinkers. The Classics roster is Seneca, Marcus Aurelius, Socrates, Confucius, Benjamin Franklin, the Buddha and Maria Montessori. The Business roster has simulations inspired by Peter Drucker, Steve Jobs and Andy Grove, plus Socrates. The advisers are AI simulations, not the historical people.
>
> Quotes are checked. Each Classics adviser draws on one public-domain translation: Gummere's Seneca, Long's Marcus Aurelius, Jowett's Plato, Legge's Analects, Müller and Sujato for the Buddha, Anne E. George's Montessori translation, and Franklin's own writing. A quotation is matched against the source passages before it's shown. If it can't be verified, it is removed.
>
> Each session ends in a journal entry: the decision, your reasoning, the assumptions, one next action, and optionally a dated commitment with an email reminder. When you return, the council can recall your last entry.
>
> Sign in with your email address via OAuth. Free, currently in beta.
- Categories: Productivity; Education (or the closest available)
- Docs URL: `https://council.dravec.org/<connector-docs page, to create>`. Privacy URL: `https://council.dravec.org/privacy` (live)
- Use cases: reflecting on a personal or work decision; getting several viewpoints on a choice; keeping a decision journal with follow-up reminders.
- Data handling: own API (the founder's gateway). No health data. No sponsored content.

---

## 8. ChatGPT app directory (OpenAI, now via plugins)

**Source:** https://developers.openai.com/apps-sdk/deploy/submission (accessed 2026-10-27). Background: https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/

- Apps are now submitted **as plugins**: platform.openai.com/plugins → "Upload new or existing plugin" → a ZIP with the manifest, MCP config and assets.
- Requirements: individual or business **identity verification**. Manifest `displayName` ≤30, `shortDescription` ≤30, `longDescription` ≤4000, `developerName`, `category`. HTTPS `websiteURL`, `supportURL`, `privacyPolicyURL`, **`termsOfServiceURL`**. Square logo ≥48 px. One stable public remote MCP endpoint. Domain verification via `https://<host>/.well-known/openai-apps-challenge`. Auth: none, OAuth or mixed.
- Review needs: a reviewer test account that works "without MFA, email or SMS codes, magic links". **5 positive + 3 negative test cases. A demo video URL.** Commerce declaration.
- Cost: none stated.
- **Blockers:** email-only sign-in probably conflicts with the "no email codes / magic links" rule (needs a password-style reviewer login). There's no Terms of Service page yet (assumed). Identity verification. This is the heaviest submission. Do it last.

**Draft manifest fields:**
- displayName (18): `Mastermind Council`
- shortDescription (≤30): `Decide with Stoic advisers` (26)
- longDescription: reuse the Claude description above.
- Starter prompts (≤128 each):
  - `Convene the council: should I take the job offer in Prague or stay where I am?`
  - `Ask Seneca and Marcus Aurelius how to think about a decision I keep putting off.`
  - `Run a business council on whether to cut our product scope before launch.`
- Positive tests (5): start a Classics session; start a Business session; ask for a verified quote on fear; finish a session to a journal entry; set a dated commitment. Negative tests (3): "What's the weather in Brno?"; "Write me Python code"; "Book a flight". The council shouldn't trigger on these.

---

## 9. AI-tool directories (AIO baseline)

These rank for assistant-style queries ("AI tool to help me make a decision"). Only the free ones are actionable under the $0 rule.

### Product Hunt: free, after the beta opens
Sources: https://www.producthunt.com/launch, https://help.producthunt.com/en/articles/479557-how-to-post-a-product (accessed 2026-10-27). Free, personal account, self-hunting allowed, description ≤260, gallery of 2+ images. **Listing text: see community-drafts.md §9** (name, 57-char tagline, 253-char description, maker comment).

### AlternativeTo: free, after the beta opens
Sources: https://alternativeto.net/faq (403 here; content via search summary), https://saascity.io/directories/alternativeto (secondary, accessed 2026-10-27)
- Free: account + verified email → user icon → **Suggest new application** → Platforms, License, Description, Tags → Submit. Manual review. A secondary source mentions an optional ~$5 priority review (skip it) and says **unreleased products are not accepted**, and "thin AI wrappers" are rejected. So submit after the beta opens, and lead with the quote verification, which is the non-wrapper part.
- Listing:
  - Name: `Mastermind Council`
  - Platforms: Web (Online). Licence: Free, Proprietary
  - Tags: decision-making, journaling, stoicism, ai-assistant, philosophy, mcp
  - Alternative to: SynthBoard (closest), plus general decision-journal and journaling apps the site already lists (pick existing entries)
  - Description:
  > Mastermind Council is a web app for thinking through a decision with AI advisers modelled on historical thinkers: Seneca, Marcus Aurelius, Socrates, Confucius, Benjamin Franklin, the Buddha and Maria Montessori, or a business roster inspired by Drucker, Jobs and Grove. A neutral facilitator runs the session. Quotes are checked against one public-domain translation per thinker before they are shown, and unverifiable ones are removed. Each session ends in a journal entry with your decision, reasoning, assumptions and one next action, with an optional dated email reminder. Also has a voice mode, a daily question, and an MCP connector for Claude and ChatGPT. Free.

### There's An AI For That: no free permanent listing
Sources: https://theresanaiforthat.com/submit/ (403 Cloudflare challenge here), https://vantaige.io/blog/where-to-list-your-ai-tool-2026, https://orangebot.ai/blog/where-to-submit-your-ai-tool-2026 (secondary, accessed 2026-10-27)
- Reported pricing: $49 website-only permanent listing, $347 package. The only free route is a monthly X-thread giveaway (one winner). **Skip under $0.** If the giveaway thread is used, the listing text is ready:
  - Name: `Mastermind Council`. Task: `Decision making`
  - One-liner: `Talk a decision through with AI advisers modelled on the Stoics and classics, with quotes checked against source texts.`
  - Description: same as AlternativeTo.
  - Pricing: Free

### topai.tools: paid only
Source: https://topai.tools/submit (403 here; prices from the search summary of that page, accessed 2026-10-27)
- $47 one-time "Fast Listing" or $229 "Premium". Editorial review, refund if rejected. No free tier found. **Skip.** Ready text if the budget changes: one-liner and description as for TAAFT. Category: Productivity / Personal assistant.

### Futurepedia: paid only (as far as I could verify)
Sources: futurepedia.io/submit-tool (404 to this fetcher; tiers from the search summary of the official page), https://futurepedia.gumroad.com/l/submit-tool, competitor claims of a free path at https://www.tooljunction.io/vs/futurepedia (accessed 2026-10-27)
- Official: Basic Listing $247 (sold out), Verified Listing $497 one-time. Competitor pages say submission is free and paid tiers are optional. **Unconfirmed. Pavol should check the live page for a free option. Otherwise skip.** Text as for TAAFT. Category: Productivity / Life assistant.

### toolmage.com: free
Sources: https://www.toolmage.com/en/pages/submission-policy/ (accessed 2026-10-27), https://www.toolmage.com/de/submit-you-ai/ (submit page via search: shows a $69 fee option)
- The policy says "ToolMage supports free AI tool submissions." There's a 13-field form: name, official URL ("valid and accessible"), category, tags, suitable professions, pricing type, short description, detailed description (≥500 words recommended), logo (JPG/PNG ≤2 MB), ≥1 preview image, and optional extra images, video and social links. The submit page also shows a $69 paid route. **Choose the free route only.** Submit after the beta opens.
- Listing:
  - Name: `Mastermind Council`. URL: `https://council.dravec.org`. Pricing: Free
  - Category: Productivity / Personal development. Tags: decision making, journaling, stoicism, philosophy, AI advisers, MCP
  - Suitable professions: founders, managers, students, coaches, writers
  - Short description: `Think through a decision with AI advisers modelled on Seneca, Marcus Aurelius, Socrates and other classics, with quotes checked against public-domain source texts.`
  - Detailed description (~520 words):

> Mastermind Council is a free web app for thinking through a decision with a panel of AI advisers modelled on historical thinkers. You describe the decision in a sentence or two. A neutral facilitator then runs a short session in which the advisers respond from their own perspectives, ask questions, and push back where your reasoning is thin.
>
> There are two rosters. The Classics roster is Seneca, Marcus Aurelius, Socrates, Confucius, Benjamin Franklin, the Buddha and Maria Montessori. The Business roster has simulations inspired by Peter Drucker, Steve Jobs and Andy Grove, joined by Socrates. All advisers are AI simulations. They aren't the people themselves, and the app doesn't pretend otherwise.
>
> What sets Mastermind Council apart is how it handles quotations. AI tools that imitate historical figures routinely invent quotes and attribute them confidently. Here, each Classics adviser draws on a single public-domain translation: Richard Gummere's translation of Seneca's letters, George Long's Marcus Aurelius, Benjamin Jowett's Plato for Socrates, James Legge's Analects for Confucius, the Müller and Sujato translations for the Buddha, Anne E. George's translation of Montessori, and Franklin's own writing. Before a quotation appears in a session, it is checked against those source passages. If a line can't be verified, it is removed, so anything in quotation marks is the thinker's own words in that translation. 365 lines have passed this check so far.
>
> Those verified lines are also published as public pages grouped by topic, for example time, fear, anger and work, at council.dravec.org/on/. You can read them without an account.
>
> Every session ends in a journal entry rather than an open-ended chat. The entry records the decision, your reasoning, the assumptions you're making, and one concrete next action. You can add a dated commitment, and the app will send you an email reminder on that date. If you're signed in, your next session starts with a short "Last time…" recap, so the council can follow up on what you said you'd do.
>
> Other features: a Talk mode for speaking with the council by voice, and one shared daily question that everyone using the app sees on the same day.
>
> Mastermind Council is also available as a remote MCP server at llm.dravec.org/mcp, with OAuth sign-in by email. You can add it as a connector in Claude or ChatGPT and run the same council flow from inside those assistants. It exposes five tools.
>
> The app is built and run by a solo developer, Pavol Dravecký, in the Czech Republic. It runs on Cloudflare Workers. All model calls go through the founder's own gateway with a monthly spending cap, which is what keeps it free. There is no paid plan. The app is in beta.
>
> Who it's for: anyone facing a decision they keep circling. That includes founders weighing a pivot, managers choosing between two hires, students picking a direction, and people who already read the Stoics and want to apply them to a real choice, with sources they can check.

---

## Recommended order (all for Pavol to do)

1. Decide the namespace. Add the apex TXT record on dravec.org in Cloudflare. Publish `server.json` to the official registry once MCP sign-in works without the beta password. (PulseMCP and probably Glama follow from this.)
2. Glama connector: add it or claim it (DNS).
3. Smithery: test the connect flow first, because of CIMD.
4. Claude directory: after the privacy page, docs page, tool annotations and reviewer access are in place.
5. After the beta opens: Product Hunt, AlternativeTo, toolmage (free route), the awesome-remote-mcp-servers PR.
6. ChatGPT last (verification, ToS, demo video, password-style reviewer login).
7. Skip the paid ones: TAAFT, topai.tools, Futurepedia (unless a free path is confirmed), and the mcp.so paid tier.
