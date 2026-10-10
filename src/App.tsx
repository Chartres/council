import { useEffect } from 'react'
import { CouncilProvider, useCouncil } from '@/app/CouncilContext'
import { MastermindProvider } from '@/app/MastermindContext'
import { AuthProvider } from '@/auth/AuthContext'
import { track } from '@/analytics'
import { AdminBar } from '@/components/AdminBar'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'
import { PasswordPanel } from '@/components/PasswordPanel'
import { ConversationScreen } from '@/components/screens/ConversationScreen'
import { HomeScreen } from '@/components/screens/HomeScreen'
import { IntakeScreen } from '@/components/screens/IntakeScreen'
import { JournalScreen } from '@/components/screens/JournalScreen'
import { StartScreen } from '@/components/screens/StartScreen'
import { IdeasScreen } from '@/components/screens/IdeasScreen'
import { PrivacyScreen } from '@/components/screens/PrivacyScreen'
import { SessionScreen } from '@/components/screens/SessionScreen'

const SCREENS = {
  start: StartScreen,
  intake: IntakeScreen,
  conversation: ConversationScreen,
  journal: JournalScreen,
  home: HomeScreen,
  session: SessionScreen,
  ideas: IdeasScreen,
  privacy: PrivacyScreen,
}

// In-session views hide the tab bar: a place you are in, not a tab (DESIGN.md).
const NO_NAV = new Set(['session', 'intake', 'conversation'])

function Shell() {
  const { view, gate, isAdmin } = useCouncil()
  useEffect(() => {
    track('page_view', { view })
  }, [view])
  const Screen = SCREENS[view]

  return (
    <div
      className="flex min-h-full flex-col"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <Header />
      {gate === 'ready' && isAdmin && <AdminBar />}
      <main
        className="flex-1"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {/* The privacy page is public: readable before the beta door. */}
        {gate === 'ask' && view !== 'privacy' ? <PasswordPanel /> : <Screen />}
      </main>
      {gate === 'ready' && !NO_NAV.has(view) && <BottomNav />}
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <CouncilProvider>
        <MastermindProvider>
          <Shell />
        </MastermindProvider>
      </CouncilProvider>
    </AuthProvider>
  )
}
