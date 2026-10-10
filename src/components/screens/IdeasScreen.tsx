import { useCouncil } from '@/app/CouncilContext'
import { Monogram } from '@/components/Monogram'
import { SignInPanel } from '@/components/SignInPanel'
import { useAuth } from '@/auth/AuthContext'
import { voteSplit } from '@/domain/council'
import { humanDate } from '@/domain/dates'

export function IdeasScreen() {
  const { ideas, open, go } = useCouncil()
  const { user, configured } = useAuth()

  return (
    <div className="mx-auto max-w-xl px-4 pb-6">
      <h1 className="t-display pt-6">My ideas</h1>
      <p className="t-body mt-2 text-marble-400">
        {user
          ? 'Kept on your account — every council you have convened.'
          : 'Kept in this browser only. Sign in to keep them across devices.'}
      </p>

      {ideas.length === 0 ? (
        <div className="mt-12">
          <p className="t-body">Nothing here yet.</p>
          <button
            type="button"
            onClick={() => go('home')}
            className="slab mt-6"
          >
            Bring the council an idea
          </button>
        </div>
      ) : (
        <ul className="mt-12 space-y-6">
          {ideas.map((item) => {
            const split = item.verdict ? voteSplit(item.verdict.votes) : null
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="flex w-full flex-col gap-2 rounded-card text-left"
                >
                  <span className="t-title line-clamp-3">{item.idea}</span>
                  <span className="t-label">
                    {humanDate(item.created_at, { weekday: false })}
                    {item.daily_key && ' · daily question'}
                  </span>
                  {split && (
                    <span className="flex items-center gap-2">
                      <span className="flex gap-1">
                        {Object.keys(item.verdict!.votes).map((id) => (
                          <Monogram key={id} id={id} size={22} />
                        ))}
                      </span>
                      <span className="text-[15px] text-marble-300">
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
        <div className="mt-12">
          <SignInPanel reason="Sign in to keep these ideas when you change browser or phone." />
        </div>
      )}
    </div>
  )
}
