import { clientEntry } from 'remix/component'
import type { Handle, RemixNode } from 'remix/component'

import { Loader } from './ui/icons.tsx'
import { button, type ButtonOptions } from './ui/styles.ts'

export interface PendingButtonProps extends ButtonOptions {
  children?: RemixNode
  pendingLabel?: string
  // Show a spinner in place of (iconOnly) or before the label while pending.
  spinner?: boolean
  iconOnly?: boolean
  disabled?: boolean
  title?: string
}

// A submit button that disables itself while its form's navigation is in flight. Before
// hydration it is a plain submit button, so the form still works without JavaScript.
export const PendingButton = clientEntry(import.meta.url, function PendingButton(handle: Handle<PendingButtonProps>) {
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
    let { children, pendingLabel, spinner = false, iconOnly = false, disabled, title, variant, size, extra } = handle.props
    let showSpinner = pending && spinner
    return (
      <button type="submit" title={title} disabled={disabled || pending} mix={button({ variant, size, extra })}>
        {showSpinner && <Loader spin />}
        {showSpinner && iconOnly ? null : pending && pendingLabel ? pendingLabel : children}
      </button>
    )
  }
})
