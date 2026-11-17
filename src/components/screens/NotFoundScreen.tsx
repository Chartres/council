import { useEffect } from 'react'
import { useCouncil } from '@/app/CouncilContext'
import { BlankLeaf, Device } from '@/components/Furniture'
import { LEAF_WANTING } from '@/content/catalogue'

/** An unknown path: the catalogue's note for a missing leaf, under the device. */
export function NotFoundScreen() {
  const { go } = useCouncil()
  const [head, ...rest] = LEAF_WANTING.split('. ')
  // Pages answers 200 for any path (the app is the fallback): keep the missing leaf out of indexes.
  useEffect(() => {
    const meta = Object.assign(document.createElement('meta'), { name: 'robots', content: 'noindex' })
    document.head.append(meta)
    return () => meta.remove()
  }, [])
  return (
    <div className="mx-auto max-w-xl px-4 pt-8 pb-6 text-center" data-testid="not-found">
      <Device size={92} className="mx-auto" />
      <h1 className="rubric mt-4">{head}</h1>
      <BlankLeaf className="mt-4">
        <p className="t-body italic text-marble-50">{rest.join('. ')}</p>
        <p className="t-ref mt-2 break-all">{window.location.pathname}</p>
      </BlankLeaf>
      <button type="button" onClick={() => go('start')} className="slab mt-6">
        Back to the council
      </button>
    </div>
  )
}
