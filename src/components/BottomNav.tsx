import { useCouncil, type View } from '@/app/CouncilContext'

// Tabs = journeys (mobile-ux): sit with the group (v4), its journal, and v3's quick
// verdict. Past discussions and quick verdicts are in the Discussions sheet (header).
// Night edition: the tabs are words in small capitals at the foot of the page; the open one
// sits under a clay rule. `name` keeps the full name for assistive tech where the word is short.
const TABS: { view: View; label: string; name?: string }[] = [
  { view: 'start', label: 'Council' },
  { view: 'journal', label: 'Journal' },
  { view: 'home', label: 'Verdict', name: 'Quick verdict' },
]

export function BottomNav() {
  const { view, go } = useCouncil()
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-950/92 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const active = view === tab.view || (tab.view === 'home' && view === 'session')
          return (
            <li key={tab.view} className="flex-1">
              <button
                type="button"
                onClick={() => go(tab.view)}
                aria-current={active ? 'page' : undefined}
                aria-label={tab.name}
                className={`tabs-foot flex min-h-14 w-full items-center justify-center border-t-2 ${
                  active ? 'border-clay-400 text-marble-50' : 'border-transparent text-marble-400 hover:text-marble-200'
                }`}
              >
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
