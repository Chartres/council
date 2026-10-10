import { useCouncil, type View } from '@/app/CouncilContext'

// Tabs = journeys (mobile-ux): sit with the group (v4), its journal, and v3's quick
// verdict with its history.
const TABS: { view: View; label: string; icon: React.ReactNode }[] = [
  {
    view: 'start',
    label: 'Council',
    icon: (
      <>
        <circle cx="12" cy="7" r="2.6" />
        <circle cx="5.5" cy="12" r="2.2" />
        <circle cx="18.5" cy="12" r="2.2" />
        <path d="M4 20c0-3 3.6-5 8-5s8 2 8 5" strokeLinecap="round" />
      </>
    ),
  },
  {
    view: 'journal',
    label: 'Journal',
    icon: <path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6zM6 3v18M10 8h5M10 12h5" strokeLinejoin="round" />,
  },
  {
    view: 'home',
    label: 'Quick verdict',
    icon: <path d="M12 3v3M5 9h14M7 9l-3 7a4 4 0 0 0 6 0zM17 9l-3 7a4 4 0 0 0 6 0zM12 6v15M8 21h8" strokeLinejoin="round" />,
  },
  {
    view: 'ideas',
    label: 'My ideas',
    icon: <path d="M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h4" strokeLinejoin="round" />,
  },
]

export function BottomNav() {
  const { view, go } = useCouncil()
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-800 bg-ink-950/92 backdrop-blur"
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
                className={`flex min-h-12 w-full flex-col items-center gap-1 py-2 text-[13px] font-medium leading-[18px] ${
                  active ? 'text-marble-50' : 'text-marble-400 hover:text-marble-200'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.5}
                  aria-hidden="true"
                >
                  {tab.icon}
                </svg>
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
