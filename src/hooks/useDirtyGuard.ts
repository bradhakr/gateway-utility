import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Blocks in-app navigation (sidebar links, browser Back) and browser unload
 * (tab close, refresh) while isDirty is true.
 *
 * Returns the react-router Blocker — check `blocker.state === 'blocked'` to
 * know when to render a confirmation dialog, then call `blocker.reset()` to
 * cancel or `blocker.proceed()` to allow the navigation.
 */
export function useDirtyGuard(isDirty: boolean) {
  const blocker = useBlocker(isDirty)

  useEffect(() => {
    if (!isDirty) return
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return blocker
}
