// Crawlable topic pages: what the classical thinkers actually wrote about a common decision,
// built only from the verified quote banks (src/content/verified-quotes.json, see quotes.mjs).
// Plain HTML with no JavaScript, so search engines and AI crawlers read it as people do. Never
// any user's session or text.
//
//   node scripts/prerender.mjs        # writes public/on/**/index.html and public/sitemap.xml
//
// The output is committed; src/prerender.test.ts fails when it is stale.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PERSONAS } from './quotes.mjs'

export const HOST = 'https://council.dravec.org'

/** The decisions people bring, and a plain framing for each. Our words; the quotes are theirs. */
export const TOPICS = {
  time: 'How long a life is depends less on its length than on how the hours are used. These are the lines to read when a decision keeps being put off.',
  fear: 'Most decisions that stall are stalled by fear of a loss that has not happened yet. Several of these writers separate the event from the judgment we make about it.',
  money: 'Enough, debt, and what money is for. Franklin is practical, Seneca is suspicious of it, Confucius asks how it was gained.',
  work: 'Work as duty, as craft and as a trap. Lines for deciding what to take on and what to put down.',
  failure: 'Mistakes, starting again, and the faults we keep repeating. Failure read as information rather than as a verdict.',
  risk: 'Acting without certainty: what can be lost, what is lost by never moving, and how to tell the two apart.',
  relationships: 'Friends, advisers and the people a decision touches: whom to trust, and how to treat them when you disagree.',
  habit: 'Character is built from repeated acts. The small daily practices these thinkers kept, and why they kept them.',
  death: 'For the Stoics, remembering that time ends is a way of deciding well now, not a morbid exercise.',
  power: 'Power in two senses: what is in your control (Marcus Aurelius and Seneca keep returning to it), and the power one person holds over another (Montessori and Confucius on teachers and rulers).',
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

/** Quotes for a topic, grouped by thinker, the thinker with most lines first. */
export function topicGroups(quotes, topic) {
  const by = new Map()
  for (const q of quotes.filter((x) => x.tags.includes(topic))) {
    if (!by.has(q.persona)) by.set(q.persona, [])
    by.get(q.persona).push(q)
  }
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}

const STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #100e0b; color: #ece7db; font: 17px/1.55 'EB Garamond', 'Iowan Old Style', Georgia, serif; }
  main { max-width: 40rem; margin: 0 auto; padding: 24px 16px 64px; }
  a { color: #efce8d; text-underline-offset: 3px; }
  nav, .small { font: 13px/1.4 Inter, system-ui, sans-serif; color: #968d7c; }
  h1 { font-size: 34px; line-height: 1.15; font-weight: 500; margin: 16px 0 12px; }
  h2 { font-size: 15px; font-weight: 600; font-variant-caps: all-small-caps; letter-spacing: .06em; color: #cf9179; margin: 40px 0 8px; }
  blockquote { margin: 16px 0 0; font-size: 20px; line-height: 1.45; }
  cite { display: block; margin-top: 4px; font: normal 13px/1.4 Inter, system-ui, sans-serif; color: #968d7c; }
  .lede { color: #d8d1c2; }
  .cta { margin-top: 48px; padding-top: 16px; border-top: 1px solid #342d23; }
  ul.topics { padding: 0; list-style: none; } ul.topics li { margin: 12px 0; }
`

function page({ path, title, description, body, jsonld }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${HOST}${path}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Mastermind Council" />
<meta property="og:url" content="${HOST}${path}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${HOST}/og.png" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}

const METHOD =
  'Every line below appears word for word in the public-domain translation named under it; a script checked each one against the text of that edition. The link opens the letter, book or edition it came from.'

export function topicPage(quotes, topic) {
  const groups = topicGroups(quotes, topic)
  const n = groups.reduce((s, [, qs]) => s + qs.length, 0)
  const names = groups.map(([p]) => PERSONAS[p].name)
  const path = `/on/${topic}/`
  const title = `What the classics wrote about ${topic} — ${n} verified quotes`
  const description = `${n} lines on ${topic} from ${listOf(names)}, each checked word for word against a public-domain translation, with the letter, book or verse it comes from.`
  const sections = groups
    .map(
      ([p, qs]) => `<section>
<h2>${esc(PERSONAS[p].name)}</h2>
${qs
  .map(
    (q) => `<blockquote>“${esc(q.text)}”<cite>${esc(PERSONAS[p].name)}, ${esc(PERSONAS[p].work)}, ${esc(q.locator)}${
      PERSONAS[p].translator ? ` · trans. ${esc(PERSONAS[p].translator)}` : ''
    } · <a href="${esc(q.url)}">source</a></cite></blockquote>`,
  )
  .join('\n')}
</section>`,
    )
    .join('\n')
  const body = `<nav><a href="/">Mastermind Council</a> › <a href="/on/">The classics on…</a></nav>
<h1>What the classics wrote about ${esc(topic)}</h1>
<p class="lede">${esc(TOPICS[topic])}</p>
<p class="small">${esc(METHOD)}</p>
${sections}
<p class="cta">Facing a decision about ${esc(topic)}? <a href="/">Bring it to the Council</a>: advisers modelled on these thinkers talk it through with you and quote only what they actually wrote. The Council is in private beta; these pages are open to everyone.</p>
<p class="small">The advisers in the app are AI simulations, not the historical people. The quotes on this page are theirs.</p>`
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: `${HOST}${path}`,
    isPartOf: { '@type': 'WebSite', name: 'Mastermind Council', url: `${HOST}/` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: n,
      itemListElement: groups.flatMap(([p, qs]) =>
        qs.map((q) => ({
          '@type': 'Quotation',
          text: q.text,
          creator: { '@type': 'Person', name: PERSONAS[p].name },
          isPartOf: { '@type': 'Book', name: PERSONAS[p].work, ...(PERSONAS[p].translator ? { translator: PERSONAS[p].translator } : {}) },
          citation: `${PERSONAS[p].work}, ${q.locator}`,
          url: q.url,
        })),
      ),
    },
  }
  return { path, html: page({ path, title, description, body, jsonld }), count: n }
}

export function indexPage(quotes) {
  const rows = Object.keys(TOPICS).map((t) => [t, topicGroups(quotes, t).reduce((s, [, qs]) => s + qs.length, 0)])
  const title = 'The classics on the decisions people bring — verified quotes'
  const description = `What Seneca, Marcus Aurelius, Confucius, Franklin and others actually wrote about time, fear, money, work and risk: ${quotes.length} lines, each checked against a public-domain translation.`
  const body = `<nav><a href="/">Mastermind Council</a></nav>
<h1>The classics on the decisions people bring</h1>
<p class="lede">The Council's advisers are modelled on thinkers with a body of work. When one of them quotes, the line has to be in that work. These pages collect the lines, by the kind of decision they help with.</p>
<ul class="topics">
${rows.map(([t, n]) => `<li><a href="/on/${t}/">${esc(t[0].toUpperCase() + t.slice(1))}</a> <span class="small">· ${n} quotes</span></li>`).join('\n')}
</ul>
<h2>How the quotes are checked</h2>
<p class="small">Each thinker has a bank of lines taken from one public-domain translation: Gummere's Seneca, George Long's Marcus Aurelius, Jowett's Plato, Legge's Analects, Müller's Dhammapada with Bhikkhu Sujato's suttas, Anne E. George's Montessori, and Franklin's own Autobiography and Way to Wealth. A script downloaded each edition and checked that every line is a contiguous match in the named letter, book, chapter or verse. In the app, a quotation an adviser makes is checked against the source passages before it is shown; one that cannot be found is shown as paraphrase, not in quotation marks.</p>
<p class="cta"><a href="/">Open the Council</a></p>`
  const jsonld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: `${HOST}/on/` }
  return { path: '/on/', html: page({ path: '/on/', title, description, body, jsonld }) }
}

export function sitemap(paths, lastmod) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${HOST}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>
`
}

/** Everything the script writes, as {file: contents}. */
export function build(quotes, lastmod) {
  const out = {}
  const index = indexPage(quotes)
  out['public/on/index.html'] = index.html
  for (const t of Object.keys(TOPICS)) out[`public/on/${t}/index.html`] = topicPage(quotes, t).html
  out['public/sitemap.xml'] = sitemap(['/', '/quick', '/privacy', '/on/', ...Object.keys(TOPICS).map((t) => `/on/${t}/`)], lastmod)
  return out
}

export const LASTMOD = '2026-10-27'

if (import.meta.url === `file://${process.argv[1]}`) {
  const quotes = JSON.parse(readFileSync('src/content/verified-quotes.json', 'utf8'))
  for (const [file, text] of Object.entries(build(quotes, LASTMOD))) {
    mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true })
    writeFileSync(file, text)
  }
  console.log('written')
}
