import { css } from 'remix/component'
import type { Handle } from 'remix/component'

import type { ConsolidatedIngredient } from '../../../data/groceries/ingredients.ts'
import type { MealSummary } from '../../../data/groceries/meals.ts'
import type { CurrentUser } from '../../../data/groceries/users.ts'
import { routes } from '../../../routes.ts'
import { GroceriesLayout } from '../layout.tsx'
import { md, pageTitle, sectionLabel } from '../public/ui/styles.ts'
import { ConsolidatedList } from './public/consolidated-list.tsx'
import { MealSelector } from './public/meal-selector.tsx'

export interface ShopPageProps {
  user: CurrentUser
  meals: MealSummary[]
  selectedIds: number[]
  items: ConsolidatedIngredient[]
  hasKrogerAuth: boolean
  result?: string | null
  error?: string | null
}

const grid = css({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '1.5rem',
  [md]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', minHeight: '60vh' },
})

// ShopPage.tsx: pick meals on the left, review the consolidated list on the right.
export function ShopPage(handle: Handle<ShopPageProps>) {
  return () => {
    let { user, meals, selectedIds, items, hasKrogerAuth, result, error } = handle.props
    return (
      <GroceriesLayout user={user} active="shop" title="Shop · 5 Minute Groceries">
        <div mix={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
          <h1 mix={pageTitle}>Shop</h1>
          <div mix={grid}>
            <div>
              <h2 mix={sectionLabel}>Select Meals</h2>
              <MealSelector
                action={routes.groceries.shop.index.href()}
                meals={meals.map(({ id, name, ingredientCount }) => ({
                  id,
                  name,
                  ingredientCount,
                }))}
                selectedIds={selectedIds}
              />
            </div>
            <div mix={css({ display: 'flex', flexDirection: 'column' })}>
              <ConsolidatedList
                items={items}
                mealIds={selectedIds}
                hasKrogerAuth={hasKrogerAuth}
                linkAction={routes.groceries.shop.link.href()}
                cartAction={routes.groceries.shop.cart.href()}
                productsUrl={routes.groceries.kroger.products.href()}
                result={result ?? null}
                error={error ?? null}
              />
            </div>
          </div>
        </div>
      </GroceriesLayout>
    )
  }
}
