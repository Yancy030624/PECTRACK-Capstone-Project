import { useEffect, useState } from 'react'

// True while the viewport matches `query`. Used by the master/detail
// screens to decide whether the detail renders beside the list (large
// screens) or as an overlay on top of it (small ones), where the list
// alone can be several thousand pixels tall and a detail card placed
// after it is never seen.
export function useMediaQuery(query) {
  const getMatch = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

// Tailwind's `lg` breakpoint — the point at which the dashboard shows its
// sidebar and the two-column list/detail layouts.
export const useIsLargeScreen = () => useMediaQuery('(min-width: 1024px)')
