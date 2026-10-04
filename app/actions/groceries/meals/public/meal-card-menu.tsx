import { clientEntry, css, on, ref } from 'remix/component'
import type { Handle } from 'remix/component'

import { post, submitForm } from '../../public/submit.ts'
import { DialogShell, NameForm, openDialog } from '../../public/ui/dialog.tsx'
import { Loader, MoreVertical, Pencil, Trash } from '../../public/ui/icons.tsx'
import { placePopover } from '../../public/ui/overlays.ts'
import {
  alpha,
  button,
  dialogFooter,
  menuItem,
  menuSeparator,
  popoverContent,
  textDestructive,
} from '../../public/ui/styles.ts'

export interface MealCardMenuProps {
  // Unique on the page; the kebab opens the menu with `popovertarget` before hydration.
  menuId: string
  mealName: string
  selected: boolean
  renameAction: string
  deleteAction: string
  // Where to go after deleting (the meal list when this meal was open).
  returnTo: string
}

const triggerStyle = button({
  variant: 'ghost',
  size: 'icon',
  extra: { height: '1.75rem', width: '1.75rem', flexShrink: 0, marginLeft: '0.5rem' },
})
const selectedTriggerStyle = button({
  variant: 'ghost',
  size: 'icon',
  extra: {
    height: '1.75rem',
    width: '1.75rem',
    flexShrink: 0,
    marginLeft: '0.5rem',
    color: 'var(--primary-foreground)',
    '&:hover': {
      background: alpha('var(--primary-foreground)', 20),
      color: 'var(--primary-foreground)',
    },
  },
})
const menuStyle = popoverContent({
  width: 'auto',
  minWidth: '8rem',
  padding: '0.25rem',
  overflow: 'hidden',
})

// The kebab menu on a meal card (Radix DropdownMenu in the source) with its Rename and
// Delete dialogs.
export const MealCardMenu = clientEntry(
  import.meta.url,
  function MealCardMenu(handle: Handle<MealCardMenuProps>) {
    let trigger: HTMLButtonElement | undefined
    let menu: HTMLElement | undefined
    let renameDialog: HTMLDialogElement | undefined
    let deleteDialog: HTMLDialogElement | undefined
    let name = handle.props.mealName
    let pending = false
    let renameError: string | null = null
    let deleteError: string | null = null

    function openRename() {
      menu?.hidePopover()
      name = handle.props.mealName
      renameError = null
      handle.update()
      openDialog(renameDialog)
    }

    function openDelete() {
      menu?.hidePopover()
      deleteError = null
      handle.update()
      openDialog(deleteDialog)
    }

    async function rename(form: HTMLFormElement, signal: AbortSignal) {
      pending = true
      handle.update()
      let result = await submitForm(form, signal, () => {
        pending = false
        renameDialog?.close()
      })
      if (result.ok || signal.aborted) return
      pending = false
      renameError = result.error
      handle.update()
    }

    async function destroy(signal: AbortSignal) {
      pending = true
      handle.update()
      let result = await post(
        handle.props.deleteAction,
        { returnTo: handle.props.returnTo },
        signal,
        () => {
          pending = false
          deleteDialog?.close()
        },
      )
      if (result.ok || signal.aborted) return
      pending = false
      deleteError = result.error
      handle.update()
    }

    return () => {
      let { menuId, mealName, selected, renameAction, deleteAction, returnTo } = handle.props
      return (
        <>
          <button
            type="button"
            aria-label={`Options for ${mealName}`}
            aria-haspopup="menu"
            popovertarget={menuId}
            mix={[
              selected ? selectedTriggerStyle : triggerStyle,
              ref((node) => (trigger = node as HTMLButtonElement)),
            ]}
          >
            <MoreVertical />
          </button>
          <div
            id={menuId}
            popover="auto"
            role="menu"
            mix={[
              menuStyle,
              ref((node) => (menu = node as HTMLElement)),
              ref((node, signal) => {
                let place = () => {
                  if (trigger && node.matches(':popover-open'))
                    placePopover(node as HTMLElement, trigger, 'end')
                }
                node.addEventListener('toggle', place, { signal })
                place()
              }),
            ]}
          >
            <button
              type="button"
              role="menuitem"
              commandfor={`${menuId}-rename`}
              command="show-modal"
              mix={[menuItem(false), on('click', openRename)]}
            >
              <Pencil />
              Rename
            </button>
            <div role="separator" mix={menuSeparator} />
            <button
              type="button"
              role="menuitem"
              commandfor={`${menuId}-delete`}
              command="show-modal"
              mix={[menuItem(true), on('click', openDelete)]}
            >
              <Trash />
              Delete
            </button>
          </div>

          <DialogShell
            id={`${menuId}-rename`}
            title="Rename meal"
            description={`Enter a new name for "${mealName}".`}
            bind={(node) => (renameDialog = node)}
            onClose={() => {
              name = handle.props.mealName
              handle.update()
            }}
          >
            <NameForm
              action={renameAction}
              returnTo={returnTo}
              name={name}
              submitLabel="Save"
              pending={pending}
              error={renameError}
              onInput={(value) => {
                name = value
                handle.update()
              }}
              onCancel={() => renameDialog?.close()}
              onSubmit={rename}
            />
          </DialogShell>

          <DialogShell
            id={`${menuId}-delete`}
            title="Delete meal"
            description={`Are you sure you want to delete "${mealName}"? This cannot be undone.`}
            bind={(node) => (deleteDialog = node)}
          >
            <form
              method="post"
              action={deleteAction}
              mix={[
                css({ display: 'grid', gap: '1rem' }),
                on('submit', (event, signal) => {
                  event.preventDefault()
                  if (!pending) destroy(signal)
                }),
              ]}
            >
              <input type="hidden" name="returnTo" value={returnTo} />
              {deleteError && (
                <p role="alert" mix={textDestructive}>
                  {deleteError}
                </p>
              )}
              <div mix={dialogFooter}>
                <button
                  type="button"
                  mix={[button({ variant: 'outline' }), on('click', () => deleteDialog?.close())]}
                >
                  Cancel
                </button>
                <button type="submit" disabled={pending} mix={button({ variant: 'destructive' })}>
                  {pending && <Loader spin />}
                  Delete
                </button>
              </div>
            </form>
          </DialogShell>
        </>
      )
    }
  },
)
