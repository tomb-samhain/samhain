import { css, on, ref } from 'remix/component'
import type { Handle, RemixNode } from 'remix/component'

import { Loader, X } from './icons.tsx'
import { button, dialog, dialogClose, dialogFooter, dialogHeader, dialogTitle, input, textSmMuted, textDestructive } from './styles.ts'

export interface DialogShellProps {
  // Unique on the page; triggers open it with commandfor/command="show-modal".
  id: string
  title: string
  description: RemixNode
  children?: RemixNode
  bind(node: HTMLDialogElement): void
  onClose?(): void
}

// shadcn's DialogContent on a native modal <dialog>: header, body, close button.
export function DialogShell(handle: Handle<DialogShellProps>) {
  let node: HTMLDialogElement | undefined

  return () => {
    let { id, title, description, children, bind, onClose } = handle.props
    return (
      <dialog
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        mix={[
          dialog,
          ref((element) => {
            node = element as HTMLDialogElement
            bind(node)
          }),
          on('close', () => onClose?.()),
          // A click on the dialog element itself is a click on the backdrop.
          on('click', (event) => {
            if (event.target === event.currentTarget) node?.close()
          }),
        ]}
      >
        <div mix={dialogHeader}>
          <h2 id={`${id}-title`} mix={dialogTitle}>
            {title}
          </h2>
          <p id={`${id}-description`} mix={textSmMuted}>
            {description}
          </p>
        </div>
        {children}
        <button type="button" mix={[dialogClose, on('click', () => node?.close())]}>
          <X />
          <span class="sr-only">Close</span>
        </button>
      </dialog>
    )
  }
}

export interface NameFormProps {
  action: string
  returnTo?: string
  name: string
  placeholder?: string
  submitLabel: string
  pending: boolean
  error: string | null
  onInput(value: string): void
  onCancel(): void
  onSubmit(form: HTMLFormElement, signal: AbortSignal): void
}

// The single-input body + footer shared by the New meal and Rename meal dialogs.
// Enter submits through the form, matching the source's onKeyDown handler.
export function NameForm(handle: Handle<NameFormProps>) {
  return () => {
    let { action, returnTo, name, placeholder, submitLabel, pending, error, onInput, onCancel, onSubmit } = handle.props
    return (
      <form
        method="post"
        action={action}
        mix={[
          css({ display: 'grid', gap: '1rem' }),
          on('submit', (event, signal) => {
            event.preventDefault()
            if (!name.trim() || pending) return
            onSubmit(event.currentTarget, signal)
          }),
        ]}
      >
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <input
          name="name"
          value={name}
          placeholder={placeholder}
          autofocus
          aria-label={placeholder ?? 'Meal name'}
          mix={[input(), on('input', (event) => onInput(event.currentTarget.value))]}
        />
        {error && (
          <p role="alert" mix={textDestructive}>
            {error}
          </p>
        )}
        <div mix={dialogFooter}>
          <button type="button" mix={[button({ variant: 'outline' }), on('click', onCancel)]}>
            Cancel
          </button>
          <button type="submit" disabled={pending || !name.trim()} mix={button()}>
            {pending && <Loader spin />}
            {submitLabel}
          </button>
        </div>
      </form>
    )
  }
}

export function openDialog(dialog: HTMLDialogElement | undefined) {
  if (dialog && !dialog.open) dialog.showModal()
}
