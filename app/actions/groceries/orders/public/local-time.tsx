import { clientEntry, ref } from 'remix/component'
import type { Handle } from 'remix/component'

// The source formatted order times with the browser's toLocaleString(). The server renders
// a UTC fallback; once hydrated this switches to the viewer's locale and time zone.
export const LocalTime = clientEntry(import.meta.url, function LocalTime(handle: Handle<{ iso: string }>) {
  let local: string | null = null
  let localize = ref(() => {
    local = new Date(handle.props.iso).toLocaleString()
    handle.update()
  })

  return () => (
    <time datetime={handle.props.iso} mix={localize}>
      {local ?? formatUtc(handle.props.iso)}
    </time>
  )
})

export function formatUtc(iso: string) {
  return `${new Date(iso).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`
}
