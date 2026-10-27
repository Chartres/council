# Mastermind Council: community post drafts

Prepared 2026-10-27. Nothing here has been posted. Every draft needs Pavol's sign-off before it goes anywhere (CLAUDE.md rule).

## Read this first

- **Beta gate.** The web app asks for a password, so most launch venues (Show HN, Product Hunt, r/SideProject) only make sense once it is open, or once there is a public password or invite link printed in the post itself. The /on/ quote pages are public, but they are reading material. On their own they don't count as "something people can try" for Show HN.
- **A possible earlier path: the MCP connector.** If https://llm.dravec.org/mcp lets anyone sign in with an email address and does **not** ask for the beta password, then the council is already usable from Claude or ChatGPT. That would make r/mcp, r/ClaudeAI and possibly a Show HN valid before the web app opens. Pavol should confirm this. On 2026-10-27 the endpoint answered an unauthenticated request with 401 plus correct OAuth discovery (protected-resource metadata, authorization-server metadata, dynamic client registration). I did not sign in.
- **Reddit rules could not be fetched.** reddit.com returns 403 to this environment, Reddit mirrors sit behind bot challenges, and the search tool is blocked from reddit.com. The Reddit summaries below come from third-party guides plus what I know of each subreddit's long-standing rules. They are marked **UNVERIFIED**. Before posting, open `https://www.reddit.com/r/<sub>/about/rules` and the pinned posts, and check the items listed under each subreddit.
- Indie Hackers and AlternativeTo also sit behind Cloudflare challenges (403), so their rules are summarised from secondary sources and marked as such.

## Summary table

| Community | Allowed? | When | Format |
|---|---|---|---|
| Hacker News (Show HN) | Yes, once people can try it | After the beta opens, or now via the MCP connector if no password is needed | `Show HN:` title (80 chars max), URL + short text, Pavol answers comments |
| r/Stoicism | Doubtful as promotion. A discussion post is possible | Any time, only if mods allow it (ask by modmail first) | Text post about quote verification, link only if mods allow |
| r/SideProject | Yes | After the beta opens (a password wall gets "can't try it" replies) | Text post with link, story, founder disclosure |
| r/startups | Only in the pinned share thread | Next "Share your startup" thread, after the beta opens | Comment in thread. Standalone posts must not promote |
| r/Entrepreneur | Effectively no (no-promotion rule) | Only a lessons-learned post with no link | Skip, or a link-free text post |
| r/ClaudeAI | Yes, with project flair | Now if the connector works without the password, otherwise after the beta | Text post, flair, say how Claude is involved |
| r/mcp | Yes (server showcases are common) | Now if the connector works without the password | Text post with endpoint and tool list |
| Indie Hackers | Yes (build-story posts) | Now (a build story doesn't need a public app) | Long-form post, link at the end |
| Product Hunt | Yes, free | After the beta opens | Name, tagline (60 chars max), description (260 chars), gallery of 2+ images, maker comment |
| Lobsters | No | n/a | Off-topic (not computing), and new accounts can't self-promote |

---

## 1. Hacker News: Show HN

**Rules:** https://news.ycombinator.com/showhn.html (accessed 2026-10-27)

- Show HN is for "something you've made that other people can play with". People must be able to try it.
- Not allowed: landing pages, sign-up pages, fundraisers, reading material such as blog posts or lists, and "If your work isn't ready for users to try out, please don't do a Show HN."
- Make it easy to try, ideally without sign-ups. Say how and why you built it. Be around to answer comments. Don't ask friends to upvote.
- The title must start with "Show HN:". HN titles max out at 80 characters.

**Allowed now?** No. A password-gated app counts as "not ready for users to try out", and the /on/ pages are reading material.
**When:** When the beta opens. Ideally visitors can start a session without an account (sign-in only for memory and reminders). If sign-in stays mandatory, say so in the text. Alternative: if the MCP connector works without the beta password, a Show HN for the connector is defensible, but the web app is the stronger entry.

**Title (79 chars):**
`Show HN: Mastermind Council – think through a decision with Seneca and Socrates`

Alternative (75 chars): `Show HN: A decision council of AI Stoics whose quotes are checked at source`

**URL:** https://council.dravec.org

**Text:**

> I built a small web app for thinking through a decision with a panel of advisers modelled on historical thinkers. You pick a roster. Classics: Seneca, Marcus Aurelius, Socrates, Confucius, Benjamin Franklin, the Buddha, Maria Montessori. Business: simulations "inspired by" Drucker, Jobs and Grove, plus Socrates. A neutral facilitator runs the session. The advisers are AI simulations, not the people themselves.
>
> The part I spent most time on is quotes. Chatbots that "speak as Seneca" invent Seneca quotes freely. Here each Classics adviser draws on one public-domain translation (Gummere's Seneca, Long's Marcus Aurelius, Jowett's Plato, Legge's Analects, Müller/Sujato for the Buddha, Anne E. George's Montessori translation, Franklin's own writing). Before a quotation is shown, it is checked against the source passages. If it can't be verified, it is shown as paraphrase, not in quote marks. There are 365 verified lines so far, and you can browse them by topic without signing in: https://council.dravec.org/on/ (for example /on/time/ and /on/fear/).
>
> A session ends in a journal entry: the decision, your reasoning, the assumptions, one next action, and optionally a dated commitment with an email reminder. If you're signed in, the next session opens with "Last time…". There is also a voice mode and one shared daily question.
>
> The same flow is exposed as an MCP server with OAuth (email sign-in) at https://llm.dravec.org/mcp, so you can add it as a connector in Claude or ChatGPT. It has five tools.
>
> It runs on Cloudflare Workers, and model calls go through my own gateway with a monthly spending cap. It's free, with no paid plan. I'm a solo developer in the Czech Republic. I'd like to hear where the verification falls short and whether the journal step is useful or just friction.

---

## 2. Reddit r/Stoicism (UNVERIFIED rules)

**Rules URL:** https://www.reddit.com/r/Stoicism/about/rules (couldn't be fetched on 2026-10-27: 403 to automated clients). Wiki: https://www.reddit.com/r/Stoicism/wiki/

**What I know (verify):** r/Stoicism is a strictly moderated discussion subreddit. Its rules have long restricted self-promotion (own blogs, videos, apps) and low-effort content, and many philosophy subs (e.g. r/philosophy) now remove AI-generated content outright. Expect an app announcement to be removed.

**Allowed?** Not as a promotional post. A discussion post about the problem of fabricated Stoic quotes is on-topic. Whether it can mention or link the project is up to the mods.
**When:** Only after a modmail asking whether a post about quote verification may link the project. If they say no, post the discussion without the link, or don't post.

**Check before posting:** the self-promotion rule; any AI-content rule; whether there is a weekly/daily thread where projects are allowed; minimum account age or karma.

**Modmail draft (send this first):**

> Subject: Question before posting: verified Seneca/Marcus quotes project
>
> Hi. I've built a free tool that checks Stoic quotations against public-domain translations (Gummere's Seneca, Long's Marcus Aurelius) before showing them. Anything it can't verify is labelled as paraphrase. There's a public page of 365 verified lines by topic at council.dravec.org/on/. It's part of an AI app, which I know is a sensitive topic here. Would a discussion post about misattributed Stoic quotes, with a link to the verified list, be acceptable? If not, I won't post it. Thanks. Pavol

**Post draft (only if the mods allow it):**

Title: `How many "Seneca quotes" online are actually in Seneca? I checked lines against Gummere's translation`

> A lot of the Stoic quotes circulating online don't appear in the letters at all, or they are heavily rewritten. I ran into this while building a tool that uses Stoic texts, so I started checking every quotation against one public-domain translation per author: Gummere for Seneca's letters, George Long for Marcus Aurelius.
>
> The rule I ended up with: if a line can't be matched to a passage, it isn't shown as a quote. It's labelled as a paraphrase. 365 lines have passed so far, and they're grouped by topic here: council.dravec.org/on/ (e.g. /on/time/, /on/fear/).
>
> Disclosure: I made this, and it's part of an app where AI simulations of these thinkers discuss a decision with you. I'm not posting to promote the app. The quote list is free and public. I'm more interested in whether people here know of misattributions I should look for, or whether Gummere and Long are the right translations to check against.

---

## 3. Reddit r/SideProject (UNVERIFIED rules)

**Rules URL:** https://www.reddit.com/r/SideProject/about/rules (couldn't be fetched on 2026-10-27). Secondary sources: https://redship.io/blog/reddit-self-promotion-rules-2026, https://www.indiehackers.com/post/every-subreddit-has-different-unwritten-rules-and-heres-how-to-decode-them-before-posting-1wSck8RGykjDv4FAwS69

**Summary:** This is the subreddit most open to sharing your own projects. Bare link drops get removed. Posts that explain what was built and why, disclose that you're the maker, and ask for specific feedback are expected. Engage in the comments.
**Allowed?** Yes.
**When:** After the beta opens. A password wall gets "I can't try it" replies. If posting before then, put the password in the post.

**Check before posting:** required flair; whether AI projects have a separate thread or a limit; the rules on account age and karma.

**Title (Reddit allows 300 chars):** `I built a decision journal where AI versions of Seneca, Marcus Aurelius and Socrates argue your problem, and every quote is checked against the source text`

**Body:**

> I'm a solo developer and this is my side project: Mastermind Council (council.dravec.org).
>
> **What it does:** you bring a decision. A neutral facilitator runs a short session with a panel of AI advisers modelled on historical thinkers. The Classics roster is Seneca, Marcus Aurelius, Socrates, Confucius, Benjamin Franklin, the Buddha and Maria Montessori. The Business roster has simulations "inspired by" Drucker, Jobs and Grove, plus Socrates. They're simulations, and the app says so.
>
> **The part I care about:** quotes are checked. Each classic adviser draws on one public-domain translation (Gummere's Seneca, Long's Marcus Aurelius, Jowett's Plato, Legge's Analects and so on). A quotation is matched against the source passages before it's shown. Anything unverifiable is shown as paraphrase. There are 365 verified lines so far, and you can browse them publicly at council.dravec.org/on/.
>
> **How it ends:** a journal entry with your decision, reasoning, assumptions and one next action, plus an optional dated commitment with an email reminder. Signed-in users get a "Last time…" recap next time. There's also a voice mode, a daily shared question, and an MCP connector for Claude and ChatGPT (llm.dravec.org/mcp).
>
> **Stack:** Cloudflare Workers, with model calls through my own gateway that has a monthly spending cap. That cap is why it's free and why I'm careful about load.
>
> **Status:** [BETA OPEN / password: ____]. Free, no paid plan.
>
> What I'd like feedback on: is the journal step at the end worth the extra minute, and does the quote/paraphrase distinction come across?

---

## 4. Reddit r/startups (UNVERIFIED rules)

**Rules URL:** https://www.reddit.com/r/startups/about/rules (couldn't be fetched on 2026-10-27). Secondary: https://notifier.so/the-best-subreddits-on-reddit-to-share-your-startup/, https://www.indiehackers.com/post/37-subreddits-to-market-your-startup-78ba39bac9

**Summary:** Self-promotion is allowed only in the designated, pinned "Share your startup" thread. Removals and bans outside it are strict. Standalone posts must be questions or discussion. AutoModerator has long required standalone posts to include the phrase "i will not promote". Check whether that's still the case.
**Allowed?** Only as a comment in the share thread. A standalone post is possible only as a genuine question with no link.
**When:** The next share thread after the beta opens.

**Share-thread comment draft:**

> **Mastermind Council** (council.dravec.org). A decision-thinking tool. AI advisers modelled on Seneca, Marcus Aurelius, Socrates and others (or a business roster inspired by Drucker, Jobs and Grove) talk through your decision with a neutral facilitator. It ends in a journal entry with one next action and an optional dated reminder. Quotes are checked against public-domain source translations, and unverifiable ones are labelled as paraphrase.
> Stage: free beta, solo founder (Czech Republic). No revenue, no paid plan yet.
> Looking for: people who make one real decision a week and will tell me whether the journal step helps.

**Optional standalone question (no link, include the AutoMod phrase if still required):**

Title: `Solo founder question: free AI tool with a hard monthly model-spend cap. Waitlist or let it degrade? (i will not promote)`

> I run a free consumer AI product where every model call goes through my own gateway, which has a monthly spending cap. When usage approaches the cap I can (a) close sign-ups, (b) slow responses or switch to a cheaper model, or (c) start charging earlier than planned. For those who've run free AI products: which of these hurt retention least? i will not promote

---

## 5. Reddit r/Entrepreneur (UNVERIFIED rules)

**Rules URL:** https://www.reddit.com/r/Entrepreneur/about/rules (couldn't be fetched on 2026-10-27). Secondary: https://www.indiehackers.com/post/every-subreddit-has-different-unwritten-rules-and-heres-how-to-decode-them-before-posting-1wSck8RGykjDv4FAwS69

**Summary (from quoted rule text in secondary sources):** "Posts and comments must NOT be made for the primary purpose of selling or promoting yourself, your company or any service." Dropping URLs or asking for DMs leads to a permanent ban. There is a karma threshold (reported as 10 comment karma in the sub).
**Allowed?** Not for promotion. Recommendation: skip. If anything, a lessons-learned post with no link and no product name in the title.

**Optional link-free draft:**

Title: `What I learned capping my own AI costs as a solo founder (no link)`

> I run a free AI app solo. Early on I routed every model call through my own gateway with a hard monthly cap, so a viral day can't produce a surprise bill. Three things I learned: (1) a spend cap is a product decision, because you have to decide what users see when it's hit; (2) per-session cost matters more than per-token price, so I shortened sessions and ended each one in a single written output rather than an open chat; (3) "free with a cap" is honest only if you tell users there's a cap. Happy to answer questions about the setup. Not linking anything.

---

## 6. Reddit r/ClaudeAI (UNVERIFIED rules)

**Rules URL:** https://www.reddit.com/r/ClaudeAI/about/rules (couldn't be fetched on 2026-10-27). Secondary: https://skillsmp.com/creators/chrislamdev/hermes-devops-skills/skills-reddit-post-launch-workflow (says new accounts are held back for about 3 days and overt promotion is downvoted)

**Summary (verify):** Projects are allowed under a "Built with Claude" / showcase-type flair. As I understand the flair requirements, the post must say what was built and how Claude was involved, and the project should be free to try. Mods remove promotional posts that don't follow this. The sub is not run by Anthropic.
**Allowed?** Yes, with the right flair.
**When:** Now, if the MCP connector works without the beta password. Otherwise after the beta opens.

**Check before posting:** the exact flair name and its requirements (e.g. "describe how you used Claude", "free to try"); account age.

**Title:** `I built a remote MCP connector that runs a decision "council" of Stoic advisers inside Claude, with quotes checked against source texts`

**Body:**

> Mastermind Council is a decision-thinking flow: you state a decision, a neutral facilitator runs a short session with AI advisers modelled on historical thinkers (Seneca, Marcus Aurelius, Socrates, Confucius, Franklin, the Buddha, Montessori, or a business roster inspired by Drucker, Jobs and Grove), and it ends in a journal entry with one next action.
>
> **Using it in Claude:** add `https://llm.dravec.org/mcp` as a custom connector (Settings → Connectors). It uses OAuth with email sign-in. There are five tools covering the council flow.
>
> **How Claude is involved:** [Pavol: fill in honestly, e.g. "I built most of it in Claude Code sessions", and which model the council itself runs on, if that's something you want to disclose.]
>
> **What's different:** each classic adviser draws on one public-domain translation, and quotations are checked against the source passages before they're shown. Unverifiable ones come back as paraphrase. 365 verified lines so far, public at council.dravec.org/on/.
>
> It's free and in beta. The web app at council.dravec.org is still password-gated [or: open]. Solo project, Czech Republic. Feedback on the tool design is welcome, especially whether five tools is the right split.

---

## 7. Reddit r/mcp (UNVERIFIED rules)

**Rules URL:** https://www.reddit.com/r/mcp/about/rules (couldn't be fetched on 2026-10-27; no secondary source found)

**Summary (verify):** In my knowledge this is a developer subreddit where server announcements with a showcase-style flair are routine. Low-effort or spammy posts get removed.
**Allowed?** Yes, most likely.
**When:** Now, if the endpoint can be used without the beta password. Lead with the technical details (transport, auth flow).

**Title:** `Remote MCP server with OAuth (DCR) on Cloudflare Workers: a "decision council" with source-checked quotes`

**Body:**

> Endpoint: `https://llm.dravec.org/mcp` (streamable HTTP).
> Auth: OAuth 2.1 with PKCE (S256), protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`, dynamic client registration, email sign-in. Unauthenticated calls return 401 with a `WWW-Authenticate` header pointing at the metadata, so Claude and ChatGPT connect without manual client setup.
> Tools: five, covering the flow: [Pavol: list the five tool names + one line each].
>
> What it does: runs a facilitated session where AI advisers modelled on Seneca, Marcus Aurelius, Socrates, Confucius and others weigh in on a decision, and it ends in a journal entry (decision, reasoning, assumptions, one next action, optional dated reminder). Quotations are checked against a public-domain translation per thinker before they're returned. Unverifiable ones are returned as paraphrase.
>
> Built on Workers. Model calls go through my own gateway with a monthly cap, so it's free but rate-limited. Solo project, beta. I'd like to hear from anyone who has run into client differences between Claude and ChatGPT with OAuth MCP servers.

---

## 8. Indie Hackers

**Rules URL:** https://www.indiehackers.com/guidelines (403 Cloudflare challenge on 2026-10-27; not verified). Secondary: https://witscode.com/resources/saas-launch-playbook/founder-communities, https://www.indiehackers.com/post/how-do-you-deal-with-self-promotion-hate-0d64208508

**Summary:** A community of founders, not a launch directory. Build stories with numbers, failures and a specific question do well. Bare announcements don't. Disclose that you're the founder, put the link at the end, and reply in the first hours.
**Allowed?** Yes, as a build story.
**When:** Now. A build story is fine during a closed beta. Mention it plainly.

**Title:** `Building a free AI product with a hard monthly spend cap, and why I check every quote against the source`

**Body:**

> I'm Pavol, a solo founder in the Czech Republic. I'm building Mastermind Council: you bring a decision, and a facilitator runs a short session with AI advisers modelled on Seneca, Marcus Aurelius, Socrates, Confucius, Franklin, the Buddha and Montessori (or a business roster inspired by Drucker, Jobs and Grove). It ends in a journal entry with one next action and an optional dated reminder.
>
> **Decision 1: verified quotes instead of vibes.** AI "Seneca" invents Seneca quotes. I tied each classic adviser to one public-domain translation and check quotations against the source passages before showing them. Unverifiable ones become paraphrase. 365 lines have passed so far. Those lines also became public topic pages (council.dravec.org/on/), which are my main bet for search traffic.
>
> **Decision 2: free, with a cap.** Everything runs on Cloudflare Workers, and model calls go through my own gateway with a monthly spending cap. No paid plan yet. The cap is the reason the app is still a password-gated beta.
>
> **Decision 3: a second surface.** The same flow is an MCP server with OAuth (llm.dravec.org/mcp), so it works as a connector inside Claude and ChatGPT.
>
> **Where I am:** private beta, no revenue, closest competitor is SynthBoard (an AI board of role archetypes).
>
> **Question:** for those who've run a free AI tool, did you open with a cap and a waitlist, or open fully and add limits later?
>
> council.dravec.org

---

## 9. Product Hunt

**Rules URLs:** https://www.producthunt.com/launch and https://help.producthunt.com/en/articles/479557-how-to-post-a-product (both accessed 2026-10-27)

**Summary:** Free. Personal accounts only (company accounts are prohibited). You can hunt your own product. Don't ask people for upvotes, only to visit and comment. Recommended launch time is 12:01 am Pacific. The description is limited to 260 characters. The gallery needs at least 2 images. There's a Status field for products not fully released. The tagline is commonly cited as 60 characters max (secondary sources; the help article gives no number). The name field is the product name only.
**Allowed?** Yes.
**When:** After the beta opens. A launch behind a password wastes the one launch day. Relaunching is allowed for "significant new iterations", but the first launch counts most.

**Name:** `Mastermind Council`
**Tagline (57 chars):** `Think a decision through with Seneca, Socrates and others`
**Description (253 chars):**
> AI advisers modelled on Stoics and classics talk through your decision, led by a neutral facilitator. Quotes are checked against public-domain source texts; unverifiable ones are shown as paraphrase. Each session ends in a journal entry and one next action.

**Topics:** Productivity, Artificial Intelligence, Journaling (pick from PH's list)
**Pricing tag:** Free
**Gallery (2+ images, 1270×760):** (1) a roster picker; (2) a session with a verified quote and its source; (3) the journal entry; (4) an /on/fear/ page.

**Maker first comment:**

> Hi, I'm Pavol. I built this alone in the Czech Republic.
>
> I wanted a way to think through decisions with the Stoics that didn't put invented quotes in their mouths. The advisers here are AI simulations, but each classic one is tied to a single public-domain translation (Gummere's Seneca, Long's Marcus Aurelius, Jowett's Plato, Legge's Analects and others), and a quotation is checked against the source before you see it. If it can't be verified, it's shown as paraphrase. You can browse the 365 verified lines by topic without an account: council.dravec.org/on/
>
> A session ends with a journal entry: decision, reasoning, assumptions, one next action, and optionally a dated commitment with an email reminder. If you sign in, the next session starts with "Last time…". There's also a voice mode, a shared daily question, and an MCP connector for Claude and ChatGPT (llm.dravec.org/mcp).
>
> It's free. Model costs go through my own gateway with a monthly cap, so if it gets slow, that's why. I'd like to know whether the journal step is useful or gets in the way.

---

## 10. Lobsters

**Rules URL:** https://lobste.rs/about (accessed 2026-10-27)

**Summary:** "Lobsters is focused pretty narrowly on computing." Off-topic: "entrepreneurship, management, careers…", plus self-help. Self-promotion should be "less than a quarter of one's stories and comments", and "New users" (first 70 days) "are not allowed to submit self-promo". Joining requires an invitation.
**Allowed?** No. The product is self-help/decision support, Pavol presumably has no account, and new accounts can't self-promote. The only on-topic angle would be a technical write-up (e.g. how quote verification against source texts works) posted by an established member. **No draft.**
