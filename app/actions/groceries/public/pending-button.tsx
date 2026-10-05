import { clientEntry } from 'remix/component'
import type { Handle, RemixNode } from 'remix/component'

import { ExternalLink, Loader, Search } from './ui/icons.tsx'
import { button, type ButtonOptions } from './ui/styles.ts'

export interface PendingButtonProps extends ButtonOptions {
  children?: RemixNode
  // Icons are named because client-entry props cannot carry styled elements.
  icon?: keyof typeof icons
  pendingLabel?: string
  // While pending, show a spinner in place of the icon (or before the label).
  spinner?: boolean
  disabled?: boolean
  title?: string
}

const icons = { search: Search, 'external-link': ExternalLink }

// A submit button that disables itself while its form's navigation is in flight. Before
// hydration it is a plain submit button, so the form still works without JavaScript.
export const PendingButton = clientEntry(
  import.meta.url,
  function PendingButton(handle: Handle<PendingButtonProps>) {
    let pending = false

    handle.frame.addEventListener(
      'reloadStart',
      () => {
        pending = true
        handle.update()
      },
      { signal: handle.signal },
    )
    handle.frame.addEventListener(
      'reloadComplete',
      () => {
        pending = false
        handle.update()
      },
      { signal: handle.signal },
    )

    return () => {
      let {
        children,
        icon,
        pendingLabel,
        spinner = false,
        disabled,
        title,
        variant,
        size,
        extra,
      } = handle.props
      return (
        <button
          type="submit"
          title={title}
          disabled={disabled || pending}
          mix={button({ variant, size, extra })}
        >
          {pending && spinner ? <Loader spin /> : icon ? <Icon name={icon} /> : null}
          {pending && pendingLabel ? pendingLabel : children}
        </button>
      )
    }
  },
)

function Icon(handle: Handle<{ name: keyof typeof icons }>) {
  return () => {
    let Component = icons[handle.props.name]
    return <Component />
  }
}
