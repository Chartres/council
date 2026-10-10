/**
 * "What we store" as an in-app link: a real href (opens in a new tab too), routed through
 * popstate so it works outside the council context (CouncilContext listens for it).
 */
export function PrivacyLink({ children = 'What we store' }: { children?: string }) {
  return (
    <a
      href="/privacy"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return
        e.preventDefault()
        window.history.pushState(null, '', '/privacy')
        window.dispatchEvent(new PopStateEvent('popstate'))
        window.scrollTo(0, 0)
      }}
      className="link"
    >
      {children}
    </a>
  )
}

// Facts verified 2026-10-08 (flywheel/docs/expansion/research/trust-and-disclosure-2026-10-08.md).
// Change a row only when the code or the provider's terms change.
const ROWS: [string, string, string, string][] = [
  [
    'Your messages and the advisers’ replies, while a session runs',
    'Cloudflare Durable Object (our gateway)',
    '24 hours',
    'The gateway code; Pavol through the Cloudflare dashboard',
  ],
  [
    'The same text, sent to write each reply',
    'Anthropic API (Claude). Replies are computed in any available region, not only the EU; Anthropic stores account data in the US',
    'Up to 30 days, then deleted; up to 2 years if a safety system flags it',
    'Anthropic, under its Commercial Terms and data processing agreement. Not used for training',
  ],
  [
    'Text or a file you bring to the intake',
    'Converted by Cloudflare Workers AI; the seven fields are written by Anthropic (as above)',
    'We keep only the fields you review, never the raw text or file',
    'Cloudflare and Anthropic while processing',
  ],
  [
    'Your question topic, Classics roster only',
    'Cloudflare Workers AI (search embedding)',
    'Not confirmed',
    'Cloudflare',
  ],
  [
    'Signed in: sessions, intake, transcript, journal, commitments',
    'Supabase, AWS London (UK, covered by an EU adequacy decision)',
    'Until you delete it',
    'You (row-level security); Pavol through the Supabase dashboard',
  ],
  [
    'Reminder emails you opted into',
    'Resend (US)',
    '30 days',
    'Resend. The subject is generic; the body contains your commitment',
  ],
  [
    'Feedback you send',
    'Cloudflare D1 (our gateway), and one email to Pavol through Resend',
    'Until Pavol has dealt with it; ask and we delete it',
    'Pavol',
  ],
  ['Usage events', 'Supabase (as above)', 'Not confirmed', 'Event names and counts only, no message text'],
  [
    'Request logs',
    'Cloudflare Workers Logs',
    '3 days',
    'Ids, token counts, model and refusal reasons, plus Cloudflare’s own request metadata. No message text',
  ],
  ['Your email address', 'Supabase Auth', 'While the account exists', 'Pavol; Resend when sending sign-in links'],
]

export function PrivacyScreen() {
  return (
    <article className="mx-auto max-w-xl px-4 pb-12 text-[15px] leading-[24px] text-marble-300">
      <h1 className="t-display pt-6">What we store</h1>
      <p className="mt-2">Mastermind Council is a small private beta run by one person. This is all of it.</p>

      <dl className="mt-12 space-y-6">
        {ROWS.map(([what, where, howLong, who]) => (
          <div key={what}>
            <dt className="t-body text-marble-50">{what}</dt>
            <dd className="mt-2">
              <span className="text-marble-400">Where: </span>
              {where}
            </dd>
            <dd>
              <span className="text-marble-400">How long: </span>
              {howLong}
            </dd>
            <dd>
              <span className="text-marble-400">Who can read it: </span>
              {who}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-12">
        What we don’t do: train models (we have none, and Anthropic does not train on API data); sell or share your data
        with anyone outside the providers above; set advertising cookies; read your sessions, except to fix a problem
        you report or when the law requires it.
      </p>

      <h2 className="t-title mt-12">Your content</h2>
      <p className="mt-2">
        You own what you write in Mastermind Council and what the advisers write back. We claim no rights to your ideas,
        plans or decisions. We don’t sell your content, and neither we nor our AI provider use it to train models. We use
        it only to run the service for you: to write replies, keep your journal if you are signed in, and send reminders
        you asked for. The providers listed above process it under data processing agreements. Nobody at Mastermind
        Council reads your sessions unless you ask for help with a problem or the law requires it. When you delete your
        account, we delete your content; provider copies expire on the schedules listed above.
      </p>

      <h2 className="t-title mt-12">Using this for work?</h2>
      <p className="mt-2">
        Leave out anything your employer treats as confidential: client names, unreleased numbers, internal documents.
        Describe the situation in general terms; the advisers work fine with that.
      </p>

      <h2 className="t-title mt-12">Who is responsible</h2>
      <p className="mt-2">
        Controller: Pavol Dravecký. Contact: <a className="link" href="mailto:council@dravec.org">council@dravec.org</a>.
        Address: to be added.
      </p>
      <p className="mt-2">
        Lawful basis: contract, to run the sessions you ask for; consent, for an account and for reminder emails.
      </p>
      <p className="mt-2">
        Your rights: you can see, export and delete your data. Signed in, Export everything and Delete everything are in
        the account menu (top right). Anything else, write to the address above. You can also complain to your data
        protection authority.
      </p>
      <p className="mt-2">Providers: Cloudflare, Anthropic, Supabase, Resend.</p>
      <p className="mt-2">The advisers are AI.</p>
    </article>
  )
}
