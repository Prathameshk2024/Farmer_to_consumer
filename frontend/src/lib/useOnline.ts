import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/**
 * Whether the phone says it has a connection.
 *
 * `navigator.onLine` can say yes on a Wi-Fi with no internet behind it, but it
 * never says no while there is one - so it is safe to put a whole screen in
 * front of the app on `false`, and the screens' own error states still cover
 * the "connected to nothing" case.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
