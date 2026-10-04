import { css } from 'remix/component'
import type { Handle } from 'remix/component'

import { routes } from '../../../routes.ts'
import { ClipboardList, Settings, ShoppingCart, UtensilsCrossed } from './ui/icons.tsx'
import { alpha } from './ui/styles.ts'

export type NavKey = 'meals' | 'shop' | 'orders' | 'settings'

export const navItems: { key: NavKey; label: string; href: string }[] = [
  { key: 'meals', label: 'Meals', href: routes.groceries.meals.index.href() },
  { key: 'shop', label: 'Shop', href: routes.groceries.shop.index.href() },
  { key: 'orders', label: 'Orders', href: routes.groceries.orders.href() },
  { key: 'settings', label: 'Settings', href: routes.groceries.settings.index.href() },
]

const icons = {
  meals: UtensilsCrossed,
  shop: ShoppingCart,
  orders: ClipboardList,
  settings: Settings,
}

const navItemBase = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 1rem',
  borderRadius: 'calc(var(--radius) - 2px)',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  fontWeight: 500,
  transitionProperty: 'color, background-color',
  transitionDuration: '150ms',
}

const activeStyle = css({
  ...navItemBase,
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
})
const inactiveStyle = css({
  ...navItemBase,
  color: 'var(--muted-foreground)',
  '&:hover': { color: 'var(--foreground)', background: 'var(--accent)' },
})

export function NavItem(handle: Handle<{ item: (typeof navItems)[number]; active: boolean }>) {
  return () => {
    let { item, active } = handle.props
    let Icon = icons[item.key]
    return (
      <a
        href={item.href}
        aria-current={active ? 'page' : undefined}
        mix={active ? activeStyle : inactiveStyle}
      >
        <Icon />
        {item.label}
      </a>
    )
  }
}

export const signOutButton = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.375rem 0.75rem',
  borderRadius: 'calc(var(--radius) - 2px)',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  transitionProperty: 'color, background-color',
  transitionDuration: '150ms',
  '&:hover': { color: 'var(--foreground)', background: 'var(--accent)' },
})

export const headerStyle = css({
  position: 'sticky',
  top: 0,
  zIndex: 40,
  borderBottomWidth: '1px',
  background: alpha('var(--background)', 95),
  '@supports (backdrop-filter: blur(0))': {
    background: alpha('var(--background)', 60),
    backdropFilter: 'blur(8px)',
  },
})
