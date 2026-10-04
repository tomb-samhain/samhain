import { clientEntry, css, on, ref } from 'remix/component'
import type { Handle } from 'remix/component'

import { NavItem, navItems, type NavKey } from './nav.tsx'
import { LogOut, Menu, X } from './ui/icons.tsx'
import { dialogClose } from './ui/styles.ts'

export interface MobileNavProps {
  active: NavKey | null
  email: string | null
  logoutHref: string
}

const triggerStyle = css({
  marginLeft: 'auto',
  padding: '0.5rem',
  borderRadius: 'calc(var(--radius) - 2px)',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transitionProperty: 'color, background-color',
  transitionDuration: '150ms',
  '&:hover': { color: 'var(--foreground)', background: 'var(--accent)' },
  '@media (min-width: 768px)': { display: 'none' },
})

const sheetSignOut = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: 'calc(var(--radius) - 2px)',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transitionProperty: 'color, background-color',
  transitionDuration: '150ms',
  '&:hover': { color: 'var(--foreground)', background: 'var(--accent)' },
})

const sheetStyle = css({
  margin: '0 0 0 auto',
  height: '100%',
  maxHeight: '100%',
  width: '16rem',
  maxWidth: '75%',
  borderLeftWidth: '1px',
  background: 'var(--background)',
  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  '&[open]': { display: 'flex', flexDirection: 'column' },
  '&::backdrop': { background: 'rgb(0 0 0 / 0.8)' },
})

// The hamburger menu and right-hand sheet from App.tsx (a Radix Sheet in the source).
export const MobileNav = clientEntry(import.meta.url, function MobileNav(handle: Handle<MobileNavProps>) {
  let dialog: HTMLDialogElement | undefined

  function close() {
    dialog?.close()
  }

  return () => {
    let { active, email, logoutHref } = handle.props
    return (
      <>
        <button
          type="button"
          aria-label="Open menu"
          commandfor="mobile-nav"
          command="show-modal"
          mix={[
            triggerStyle,
            on('click', () => {
              if (dialog && !dialog.open) dialog.showModal()
            }),
          ]}
        >
          <Menu size={20} />
        </button>
        <dialog
          id="mobile-nav"
          aria-labelledby="mobile-nav-title"
          mix={[
            sheetStyle,
            ref((node) => (dialog = node as HTMLDialogElement)),
            // Clicking the backdrop (outside the sheet's box) closes it, like Radix.
            on('click', (event) => {
              if (event.target === event.currentTarget) close()
            }),
          ]}
        >
          <h2 id="mobile-nav-title" class="sr-only">
            Navigation menu
          </h2>
          <div mix={css({ padding: '1rem 1.5rem', borderBottomWidth: '1px' })}>
            <span mix={css({ fontWeight: 600 })}>5 Minute Groceries</span>
          </div>
          <nav
            mix={[
              css({ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '1rem', flex: 1 }),
              on('click', (event) => {
                if ((event.target as Element).closest('a')) close()
              }),
            ]}
          >
            {navItems.map((item) => (
              <NavItem key={item.key} item={item} active={item.key === active} />
            ))}
          </nav>
          {email && (
            <div mix={css({ padding: '1rem', borderTopWidth: '1px' })}>
              <div mix={css({ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.5rem' })}>
                {email}
              </div>
              <form method="post" action={logoutHref}>
                <button type="submit" mix={sheetSignOut}>
                  <LogOut />
                  Sign out
                </button>
              </form>
            </div>
          )}
          <button type="button" mix={[dialogClose, on('click', close)]}>
            <X />
            <span class="sr-only">Close</span>
          </button>
        </dialog>
      </>
    )
  }
})
