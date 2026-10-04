import { clientEntry, on } from 'remix/component'
import type { Handle } from 'remix/component'

import { submitForm } from '../../public/submit.ts'
import { DialogShell, NameForm, openDialog } from '../../public/ui/dialog.tsx'
import { PlusCircle } from '../../public/ui/icons.tsx'
import { button } from '../../public/ui/styles.ts'

const newButton = button({ variant: 'green', size: 'sm', extra: { gap: '0.75rem' } })

// The green "New" button and "New meal" dialog from MealsPage.tsx.
export const NewMealButton = clientEntry(
  import.meta.url,
  function NewMealButton(handle: Handle<{ action: string }>) {
    let dialog: HTMLDialogElement | undefined
    let name = ''
    let pending = false
    let error: string | null = null

    async function create(form: HTMLFormElement, signal: AbortSignal) {
      pending = true
      error = null
      handle.update()
      let result = await submitForm(form, signal, () => {
        pending = false
        dialog?.close()
      })
      if (result.ok || signal.aborted) return
      pending = false
      error = result.error
      handle.update()
    }

    return () => (
      <>
        <button
          type="button"
          commandfor="new-meal-dialog"
          command="show-modal"
          mix={[newButton, on('click', () => openDialog(dialog))]}
        >
          <PlusCircle />
          New
        </button>
        <DialogShell
          id="new-meal-dialog"
          title="New meal"
          description="Enter a name for your new meal."
          bind={(node) => (dialog = node)}
          onClose={() => {
            name = ''
            error = null
            handle.update()
          }}
        >
          <NameForm
            action={handle.props.action}
            name={name}
            placeholder="Meal name"
            submitLabel="Create"
            pending={pending}
            error={error}
            onInput={(value) => {
              name = value
              handle.update()
            }}
            onCancel={() => dialog?.close()}
            onSubmit={create}
          />
        </DialogShell>
      </>
    )
  },
)
