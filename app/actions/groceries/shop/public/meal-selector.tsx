import { clientEntry, css, on, ref } from 'remix/component'
import type { Handle } from 'remix/component'

import { badge, button, checkbox } from '../../public/ui/styles.ts'

export interface MealSelectorProps {
  action: string
  meals: { id: number; name: string; ingredientCount: number }[]
  selectedIds: number[]
}

const row = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem',
  borderRadius: 'var(--radius)',
  borderWidth: '1px',
  background: 'var(--card)',
  cursor: 'pointer',
  transitionProperty: 'background-color',
  transitionDuration: '150ms',
  '&:hover': { background: 'color-mix(in oklab, var(--accent) 50%, transparent)' },
})
const rowName = css({ flex: 1, fontSize: '0.875rem', lineHeight: 1, fontWeight: 500, cursor: 'pointer' })

// MealSelector.tsx as a GET form of checkboxes (?meal=1&meal=2). Each row is a label, so a
// click anywhere toggles it; once hydrated, every change submits the form.
export const MealSelector = clientEntry(import.meta.url, function MealSelector(handle: Handle<MealSelectorProps>) {
  // Hides the no-JavaScript submit button once the browser takes over.
  let hydrated = false
  let markHydrated = ref(() => {
    hydrated = true
    handle.update()
  })

  return () => {
    let { action, meals, selectedIds } = handle.props
    return (
      <form
        method="get"
        action={action}
        data-rmx-history="replace"
        data-rmx-reset-scroll="false"
        mix={[
          css({ display: 'flex', flexDirection: 'column', gap: '0.5rem' }),
          on('change', (event) => event.currentTarget.requestSubmit()),
          markHydrated,
        ]}
      >
        {meals.map((meal) => (
          <label key={meal.id} mix={row}>
            <input
              type="checkbox"
              name="meal"
              value={String(meal.id)}
              defaultChecked={selectedIds.includes(meal.id)}
              mix={checkbox}
            />
            <span mix={rowName}>{meal.name}</span>
            <span mix={badge('outline')}>{meal.ingredientCount}</span>
          </label>
        ))}
        {meals.length === 0 && (
          <p mix={css({ fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center', padding: '2rem 0' })}>
            No meals yet. Go to Meals to create some.
          </p>
        )}
        {!hydrated && meals.length > 0 && (
          <button type="submit" mix={button({ variant: 'outline', size: 'sm', extra: { alignSelf: 'flex-start' } })}>
            Update list
          </button>
        )}
      </form>
    )
  }
})
