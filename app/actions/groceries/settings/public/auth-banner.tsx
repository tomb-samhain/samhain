import { clientEntry, ref } from 'remix/component'
import type { Handle } from 'remix/component'

import { CheckCircle } from '../../public/ui/icons.tsx'
import { alert, alertDescription } from '../../public/ui/styles.ts'

// "Kroger account connected successfully!" disappears after 5 seconds and drops the
// ?auth=success parameter, like the source's setSearchParams({}, { replace: true }).
export const AuthBanner = clientEntry(import.meta.url, function AuthBanner(handle: Handle) {
  let visible = true

  // ref() runs only in the browser; setup also runs during server rendering.
  let startTimer = ref((_node, signal) => {
    let timer = setTimeout(() => {
      visible = false
      let url = new URL(location.href)
      url.searchParams.delete('auth')
      history.replaceState(history.state, '', url.pathname + url.search + url.hash)
      handle.update()
    }, 5000)
    signal.addEventListener('abort', () => clearTimeout(timer))
  })

  return () =>
    visible ? (
      <div role="alert" mix={[alert('success'), startTimer]}>
        <CheckCircle />
        <div mix={alertDescription}>Kroger account connected successfully!</div>
      </div>
    ) : null
})
