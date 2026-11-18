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
      data-testid="tabs-foot"
      className="fixed inset-x-0 bottom-0 z-30 bg-ink-950"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* The rule belongs to the page: it runs the column, not the window. */}
      <ul className="mx-auto flex h-[58px] max-w-xl border-t border-ink-700">
        {TABS.map((tab) => {
          const active = view === tab.view || (tab.view === 'home' && view === 'session')
          return (
            <li key={tab.view} className="flex-1">
              <button
                type="button"
                onClick={() => go(tab.view)}
                aria-current={active ? 'page' : undefined}
                aria-label={tab.name}
                className={`tabs-foot -mt-px flex h-full w-full items-center justify-center border-t-2 ${
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
