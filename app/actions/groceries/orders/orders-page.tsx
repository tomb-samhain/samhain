import { css } from 'remix/component'
import type { Handle } from 'remix/component'

import type { OrderSummary } from '../../../data/groceries/orders.ts'
import type { CurrentUser } from '../../../data/groceries/users.ts'
import { GroceriesLayout } from '../layout.tsx'
import { pageTitle, textSmMuted } from '../public/ui/styles.ts'
import { LocalTime } from './public/local-time.tsx'

// OrdersPage.tsx: the five most recent cart submissions.
export function OrdersPage(handle: Handle<{ user: CurrentUser; orders: OrderSummary[] }>) {
  return () => {
    let { user, orders } = handle.props
    return (
      <GroceriesLayout user={user} active="orders" title="Orders · 5 Minute Groceries">
        {orders.length === 0 ? (
          <div
            mix={css({
              padding: '4rem 0',
              textAlign: 'center',
              color: 'var(--muted-foreground)',
              fontSize: '0.875rem',
              lineHeight: '1.25rem',
            })}
          >
            No orders yet. Head to the Shop page to add meals to your cart.
          </div>
        ) : (
          <div
            mix={css({
              maxWidth: '42rem',
              marginInline: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            })}
          >
            <h1 mix={pageTitle}>Recent Orders</h1>
            <div mix={css({ display: 'flex', flexDirection: 'column', gap: '0.75rem' })}>
              {orders.map((order) => (
                <div
                  key={order.id}
                  mix={css({
                    borderWidth: '1px',
                    borderRadius: 'var(--radius)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  })}
                >
                  <p mix={textSmMuted}>
                    <LocalTime iso={order.createdAt} />
                  </p>
                  <p mix={css({ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 })}>
                    {order.mealNames.length > 0 ? (
                      order.mealNames.join(', ')
                    ) : (
                      <span mix={css({ color: 'var(--muted-foreground)', fontStyle: 'italic' })}>
                        No meals recorded
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </GroceriesLayout>
    )
  }
}
