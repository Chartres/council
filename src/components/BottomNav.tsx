import { useCouncil, type View } from '@/app/CouncilContext'

// Two jobs, two tabs (mobile-ux "tabs = journeys"): convene a council, revisit one.
const TABS: { view: View; label: string; icon: React.ReactNode }[] = [
  {
    view: 'home',
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
          const active = view === tab.view
          return (
            <li key={tab.view} className="flex-1">
              <button
                type="button"
                onClick={() => go(tab.view)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 w-full flex-col items-center gap-1 py-2 text-[0.68rem] font-medium uppercase tracking-wide ${
                  active ? 'text-candle-300' : 'text-marble-500 hover:text-marble-300'
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
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
