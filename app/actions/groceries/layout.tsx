import { css } from 'remix/component'
import type { Handle, RemixNode } from 'remix/component'

import type { CurrentUser } from '../../data/groceries/users.ts'
import { routes } from '../../routes.ts'
import { Document } from '../document.tsx'
import { MobileNav } from './public/mobile-nav.tsx'
import { headerStyle, NavItem, navItems, signOutButton, type NavKey } from './public/nav.tsx'
import { LogOut } from './public/ui/icons.tsx'

export const APP_TITLE = '5 Minute Groceries'

// Tailwind's `container` at the breakpoints the source app used.
export const container = css({
  width: '100%',
  marginInline: 'auto',
  paddingInline: '1rem',
  '@media (min-width: 640px)': { maxWidth: '40rem' },
  '@media (min-width: 768px)': { maxWidth: '48rem' },
  '@media (min-width: 1024px)': { maxWidth: '64rem' },
  '@media (min-width: 1280px)': { maxWidth: '80rem' },
  '@media (min-width: 1536px)': { maxWidth: '96rem' },
})

const headerRow = css({ display: 'flex', height: '3.5rem', alignItems: 'center', gap: '0.5rem' })
const brand = css({ fontWeight: 600, marginRight: '0.5rem', '@media (min-width: 768px)': { marginRight: '1rem' } })
const desktopNav = css({
  display: 'none',
  alignItems: 'center',
  gap: '0.25rem',
  '@media (min-width: 768px)': { display: 'flex' },
})
const desktopUser = css({
  display: 'none',
  marginLeft: 'auto',
  alignItems: 'center',
  gap: '0.75rem',
  '@media (min-width: 768px)': { display: 'flex' },
})
const mainStyle = css({ paddingBlock: '1.5rem' })

export interface GroceriesLayoutProps {
  user: CurrentUser | null
  active?: NavKey
  title?: string
  children?: RemixNode
}

// App.tsx's AppLayout: sticky header with desktop nav, user menu, and mobile sheet.
export function GroceriesLayout(handle: Handle<GroceriesLayoutProps>) {
  return () => {
    let { user, active = null, title = APP_TITLE, children } = handle.props
    let logoutHref = routes.groceries.auth.logout.href()

    return (
      <Document title={title} theme="none" bodyClass="groceries" head={<link rel="stylesheet" href="/groceries/theme.css" />}>
        <div mix={css({ minHeight: '100vh', background: 'var(--background)' })}>
          <header mix={headerStyle}>
            <div mix={[container, headerRow]}>
              <span mix={brand}>{APP_TITLE}</span>
              <nav aria-label="Main" mix={desktopNav}>
                {navItems.map((item) => (
                  <NavItem key={item.key} item={item} active={item.key === active} />
                ))}
              </nav>
              {user && (
                <div mix={desktopUser}>
                  <span mix={css({ fontSize: '0.875rem', color: 'var(--muted-foreground)' })}>{user.email}</span>
                  <form method="post" action={logoutHref}>
                    <button type="submit" title="Sign out" mix={signOutButton}>
                      <LogOut />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
              <MobileNav active={active} email={user?.email ?? null} logoutHref={logoutHref} />
            </div>
          </header>
          <main mix={[container, mainStyle]}>{children}</main>
        </div>
      </Document>
    )
  }
}
