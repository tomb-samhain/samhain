import { css } from 'remix/component'
import type { Handle } from 'remix/component'

import type { MealDetail, MealSummary } from '../../../data/groceries/meals.ts'
import type { CurrentUser } from '../../../data/groceries/users.ts'
import { routes } from '../../../routes.ts'
import { GroceriesLayout } from '../layout.tsx'
import { ChevronLeft, UtensilsCrossed } from '../public/ui/icons.tsx'
import { alpha, md, pageTitle, separator, textSmMuted } from '../public/ui/styles.ts'
import { AddIngredientForm } from './public/add-ingredient-form.tsx'
import { IngredientRow } from './public/ingredient-row.tsx'
import { MealCardMenu } from './public/meal-card-menu.tsx'
import { NewMealButton } from './public/new-meal-button.tsx'

export interface MealsPageProps {
  user: CurrentUser
  meals: MealSummary[]
  selected: MealDetail | null
  // True when the URL named a meal that does not exist.
  notFound?: boolean
  error?: string
}

export function pluralize(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

const layout = css({
  [md]: { display: 'flex', gap: '1.5rem', height: 'calc(100vh - 8rem)' },
})
const listColumn = (hiddenOnMobile: boolean) =>
  hiddenOnMobile ? listColumnHiddenOnMobile : listColumnVisible
const listColumnBase = {
  flexDirection: 'column',
  gap: '0.75rem',
  [md]: { display: 'flex', width: '18rem', flexShrink: 0 },
} as const
const listColumnVisible = css({ ...listColumnBase, display: 'flex' })
const listColumnHiddenOnMobile = css({ ...listColumnBase, display: 'none' })
const listScroll = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  [md]: { flex: 1, overflowY: 'auto', paddingRight: '0.25rem' },
})
const panelBase = {
  flexDirection: 'column',
  borderWidth: '1px',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
  height: 'calc(100svh - 8rem)',
  [md]: { display: 'flex', height: 'auto', flex: 1 },
} as const
const panelVisible = css({ ...panelBase, display: 'flex' })
const panelHiddenOnMobile = css({ ...panelBase, display: 'none' })

const mealCardBase = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.625rem 0.75rem',
  borderRadius: 'var(--radius)',
  borderWidth: '1px',
  cursor: 'pointer',
  transitionProperty: 'color, background-color, border-color',
  transitionDuration: '150ms',
  // The link stretches over the whole card; the menu button sits above it.
  '& > a::after': { content: '""', position: 'absolute', inset: 0, borderRadius: 'inherit' },
  '& > button': { position: 'relative', zIndex: 1 },
} as const
const mealCard = css({
  ...mealCardBase,
  background: 'var(--card)',
  '&:hover': { background: 'var(--accent-surface)' },
})
const mealCardSelected = css({
  ...mealCardBase,
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  borderColor: 'var(--primary)',
})
const mealLink = css({
  minWidth: 0,
  outline: 'none',
  '&:focus-visible::after': { boxShadow: '0 0 0 2px var(--ring)' },
})
const mealName = css({
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})
const mealCount = css({ fontSize: '0.75rem', lineHeight: '1rem', color: 'var(--muted-foreground)' })
const mealCountSelected = css({
  fontSize: '0.75rem',
  lineHeight: '1rem',
  color: alpha('var(--primary-foreground)', 70),
})

const backLink = css({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.75rem 1rem',
  borderBottomWidth: '1px',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--muted-foreground)',
  transitionProperty: 'color, background-color',
  transitionDuration: '150ms',
  '&:hover': { color: 'var(--foreground)', background: 'var(--accent-surface)' },
  [md]: { display: 'none' },
})
const panelBody = css({
  flex: 1,
  overflow: 'hidden',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  [md]: { padding: '1.5rem' },
})
const emptyPanel = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--muted-foreground)',
  gap: '0.75rem',
  padding: '1.5rem',
})
const emptyText = css({
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--muted-foreground)',
  textAlign: 'center',
})

// MealsPage.tsx: meal list on the left, the selected meal's ingredients on the right.
// The selection lives in the URL (/groceries/meals/:mealId) instead of component state.
export function MealsPage(handle: Handle<MealsPageProps>) {
  return () => {
    let { user, meals, selected, notFound = false, error } = handle.props
    let hasSelection = selected !== null || notFound
    let returnTo = selected
      ? routes.groceries.meals.show.href({ mealId: selected.id })
      : routes.groceries.meals.index.href()

    return (
      <GroceriesLayout
        user={user}
        active="meals"
        title={selected ? `${selected.name} · 5 Minute Groceries` : undefined}
      >
        <div mix={layout}>
          <div mix={listColumn(hasSelection)}>
            <div
              mix={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}
            >
              <h1 mix={pageTitle}>Meals</h1>
              <NewMealButton action={routes.groceries.meals.create.href()} />
            </div>
            {error && (
              <p role="alert" mix={css({ fontSize: '0.875rem', color: 'var(--destructive)' })}>
                {error}
              </p>
            )}
            <div mix={listScroll}>
              {meals.length === 0 ? (
                <p mix={[emptyText, css({ padding: '2rem 0' })]}>
                  No meals yet. Click "New" to get started.
                </p>
              ) : (
                meals.map((meal) => {
                  let isSelected = selected?.id === meal.id
                  let href = routes.groceries.meals.show.href({ mealId: meal.id })
                  return (
                    <div key={meal.id} mix={isSelected ? mealCardSelected : mealCard}>
                      <a href={href} aria-current={isSelected ? 'page' : undefined} mix={mealLink}>
                        <p mix={mealName}>{meal.name}</p>
                        <p mix={isSelected ? mealCountSelected : mealCount}>
                          {pluralize(meal.ingredientCount, 'ingredient')}
                        </p>
                      </a>
                      <MealCardMenu
                        menuId={`meal-menu-${meal.id}`}
                        mealName={meal.name}
                        selected={isSelected}
                        renameAction={routes.groceries.meals.rename.href({ mealId: meal.id })}
                        deleteAction={routes.groceries.meals.destroy.href({ mealId: meal.id })}
                        returnTo={returnTo}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div mix={hasSelection ? panelVisible : panelHiddenOnMobile}>
            {hasSelection ? (
              <>
                <a href={routes.groceries.meals.index.href()} mix={backLink}>
                  <ChevronLeft />
                  Back to meals
                </a>
                <div mix={panelBody}>
                  {selected ? (
                    <MealPanel meal={selected} />
                  ) : (
                    <p mix={[emptyText, css({ padding: '3rem 0' })]}>Meal not found.</p>
                  )}
                </div>
              </>
            ) : (
              <div mix={emptyPanel}>
                <UtensilsCrossed size={40} opacity={0.3} />
                <p mix={css({ fontSize: '0.875rem', lineHeight: '1.25rem' })}>
                  Select a meal to manage its ingredients
                </p>
              </div>
            )}
          </div>
        </div>
      </GroceriesLayout>
    )
  }
}

// MealIngredientPanel.tsx
function MealPanel(handle: Handle<{ meal: MealDetail }>) {
  return () => {
    let { meal } = handle.props
    let productsUrl = routes.groceries.kroger.products.href()
    return (
      <div mix={css({ display: 'flex', flexDirection: 'column', height: '100%' })}>
        <div mix={css({ marginBottom: '1rem' })}>
          <h2 mix={css({ fontSize: '1.25rem', lineHeight: '1.75rem', fontWeight: 600 })}>
            {meal.name}
          </h2>
          <p mix={textSmMuted}>{pluralize(meal.ingredients.length, 'ingredient')}</p>
        </div>
        <div mix={[separator, css({ marginBottom: '0.75rem' })]} />
        <AddIngredientForm
          action={routes.groceries.meals.addIngredient.href({ mealId: meal.id })}
        />
        <div mix={[separator, css({ marginBottom: '0.75rem' })]} />
        <div
          mix={css({
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.125rem',
            paddingRight: '0.25rem',
          })}
        >
          {meal.ingredients.length === 0 ? (
            <p mix={[emptyText, css({ padding: '3rem 0' })]}>No ingredients yet.</p>
          ) : (
            meal.ingredients.map((ingredient) => {
              let params = { mealId: meal.id, ingredientId: ingredient.id }
              return (
                <IngredientRow
                  key={ingredient.id}
                  ingredient={{
                    id: ingredient.id,
                    name: ingredient.name,
                    quantity: ingredient.quantity,
                    productName: ingredient.kroger_product_name,
                  }}
                  updateAction={routes.groceries.meals.updateIngredient.href(params)}
                  deleteAction={routes.groceries.meals.deleteIngredient.href(params)}
                  linkAction={routes.groceries.meals.linkIngredient.href(params)}
                  productsUrl={productsUrl}
                />
              )
            })
          )}
        </div>
      </div>
    )
  }
}
