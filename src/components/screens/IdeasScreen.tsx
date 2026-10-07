import { useCouncil } from '@/app/CouncilContext'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { useAuth } from '@/auth/AuthContext'
import { voteSplit } from '@/domain/council'

export function IdeasScreen() {
  const { ideas, open, go } = useCouncil()
  const { user, configured } = useAuth()

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <h1 className="pt-3 font-display text-2xl text-marble-100">My ideas</h1>
      <p className="mt-1 text-sm text-marble-400">
        {user
          ? 'Kept on your account — every council you have convened.'
          : 'Kept in this browser only. Sign in to keep them across devices.'}
      </p>

      {ideas.length === 0 ? (
        <div className="mt-6">
          <p className="text-sm text-marble-300">Nothing here yet.</p>
          <button
            type="button"
            onClick={() => go('home')}
            className="mt-3 min-h-12 w-full rounded-card bg-candle-400 px-4 py-3 font-display text-lg font-semibold text-ink-950 hover:bg-candle-300"
          >
            Bring the council an idea
          </button>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {ideas.map((item) => {
            const split = item.verdict ? voteSplit(item.verdict.votes) : null
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="vellum flex w-full flex-col gap-2 rounded-card border border-ink-700 p-3 text-left hover:border-ink-600"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-marble-500">
                      {item.created_at.slice(0, 10)}
                    </span>
                    {item.daily_key && (
                      <span className="rounded-card bg-candle-400/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-candle-300">
                        daily
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-3 font-display text-base leading-snug text-marble-100">
                    {item.idea}
                  </span>
                  {split && (
                    <span className="flex items-center gap-2">
                      <span className="flex gap-1">
                        {Object.keys(item.verdict!.votes).map((id) => (
                          <Monogram key={id} id={id} size={22} />
                        ))}
                      </span>
                      <span className="text-xs text-marble-400">
                        {split.for} for · {split.mixed} mixed · {split.against} against
                      </span>
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {configured && !user && (
        <div className="mt-6">
          <SignInPanel reason="Sign in to keep these ideas when you change browser or phone." />
        </div>
      )}
    </div>
  )
}
