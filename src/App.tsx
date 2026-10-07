import { useEffect } from 'react'
import { CouncilProvider, useCouncil } from '@/app/CouncilContext'
import { AuthProvider } from '@/auth/AuthContext'
import { track } from '@/analytics'
import { BottomNav } from '@/components/BottomNav'
import { Header } from '@/components/Header'
import { PasswordPanel } from '@/components/PasswordPanel'
import { HomeScreen } from '@/components/screens/HomeScreen'
import { IdeasScreen } from '@/components/screens/IdeasScreen'
import { SessionScreen } from '@/components/screens/SessionScreen'

function Shell() {
  const { view, gate, session } = useCouncil()
  useEffect(() => {
    track('page_view', { view: 'home' })
  }, [])

  return (
    <div
      className="flex min-h-full flex-col"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <Header />
      <main
        className="flex-1"
        style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      >
        {gate === 'ask' ? (
          <PasswordPanel rejected={session?.failure === 'password'} />
        ) : view === 'session' ? (
          <SessionScreen />
        ) : view === 'ideas' ? (
          <IdeasScreen />
        ) : (
          <HomeScreen />
        )}
      </main>
      {gate === 'ready' && view !== 'session' && <BottomNav />}
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <CouncilProvider>
        <Shell />
      </CouncilProvider>
    </AuthProvider>
  )
}
