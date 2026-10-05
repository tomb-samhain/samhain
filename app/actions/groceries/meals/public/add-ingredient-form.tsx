import { clientEntry, css, on } from 'remix/component'
import type { Handle } from 'remix/component'

import { submitForm } from '../../public/submit.ts'
import { Loader, PlusCircle } from '../../public/ui/icons.tsx'
import { button, input, textDestructive } from '../../public/ui/styles.ts'

const addButton = button({ variant: 'green' })

// The add row in MealIngredientPanel.tsx: free text parsed by the server, e.g. "2 onions".
export const AddIngredientForm = clientEntry(
  import.meta.url,
  function AddIngredientForm(handle: Handle<{ action: string }>) {
    let raw = ''
    let pending = false
    let error: string | null = null

    return () => (
      <form
        method="post"
        action={handle.props.action}
        mix={[
          css({ marginBottom: '0.75rem' }),
          on('submit', async (event, signal) => {
            event.preventDefault()
            if (!raw.trim() || pending) return
            let form = event.currentTarget
            pending = true
            error = null
            handle.update()
            let result = await submitForm(form, signal, () => {
              pending = false
              raw = ''
              handle.update()
            })
            if (result.ok || signal.aborted) return
            pending = false
            error = result.error
            handle.update()
          }),
        ]}
      >
        <div mix={css({ display: 'flex', gap: '0.5rem' })}>
          <input
            name="raw"
            value={raw}
            placeholder='Add ingredient, e.g. "2 onions"'
            aria-label="Add ingredient"
            autocomplete="off"
            mix={[
              input(),
              on('input', (event) => {
                raw = event.currentTarget.value
                error = null
                handle.update()
              }),
            ]}
          />
          <button
            type="submit"
            aria-label="Add ingredient"
            disabled={pending || !raw.trim()}
            mix={addButton}
          >
            {pending ? <Loader spin /> : <PlusCircle />}
          </button>
        </div>
        {error && (
          <p role="alert" mix={[textDestructive, css({ marginTop: '0.5rem' })]}>
            {error}
          </p>
        )}
      </form>
    )
  },
)
