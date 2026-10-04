import { clientEntry, css, on } from 'remix/component'
import type { Handle } from 'remix/component'

import { ProductSearch, type Product } from '../../public/product-search.tsx'
import { post } from '../../public/submit.ts'
import { AlertTriangle, LinkIcon, Loader, RotateCcw, ShoppingCart, X } from '../../public/ui/icons.tsx'
import { alert, alertDescription, badge, button, md, sectionLabel, table, type ButtonOptions } from '../../public/ui/styles.ts'

export interface ConsolidatedItem {
  name: string
  quantity: string | null
  krogerProductId: string | null
  krogerProductName: string | null
}

export interface ConsolidatedListProps {
  items: ConsolidatedItem[]
  mealIds: number[]
  hasKrogerAuth: boolean
  linkAction: string
  cartAction: string
  productsUrl: string
  // Set when a cart submission without JavaScript redirected back here.
  result?: string | null
  error?: string | null
}

const mobileList = css({ display: 'flex', flexDirection: 'column', gap: '0.5rem', [md]: { display: 'none' } })
const desktopTable = css({ display: 'none', [md]: { display: 'block' } })
const mobileCard = css({ borderWidth: '1px', borderRadius: 'var(--radius)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' })
const excludedCard = css({ borderWidth: '1px', borderRadius: 'var(--radius)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem', opacity: 0.5 })
const between = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' })
const textSm = css({ fontSize: '0.875rem', lineHeight: '1.25rem' })
const textSmMedium = css({ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 })
const productLine = css({ fontSize: '0.75rem', lineHeight: '1rem', color: 'var(--muted-foreground)', flex: 1 })
const struck = css({ fontSize: '0.875rem', lineHeight: '1.25rem', textDecoration: 'line-through', color: 'var(--muted-foreground)' })
const excludedLabel = css({ fontSize: '0.75rem', lineHeight: '1rem', fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.025em' })
const excludedLabelPlain = css({ fontSize: '0.75rem', lineHeight: '1rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.025em' })
const groupRow = css({
  borderBottomWidth: '1px',
  transition: 'background-color 150ms',
  '&:hover': { background: 'color-mix(in oklab, var(--muted) 50%, transparent)' },
  '& [data-reveal]': { opacity: 0, transition: 'opacity 150ms' },
  '&:hover [data-reveal], &:focus-within [data-reveal]': { opacity: 1 },
})
const excludedRow = css({ borderBottomWidth: '1px', opacity: 0.4 })
const cellMedium = css({ padding: '1rem', verticalAlign: 'middle', fontWeight: 500 })
const cellStruck = css({ padding: '1rem', verticalAlign: 'middle', fontWeight: 500, textDecoration: 'line-through', color: 'var(--muted-foreground)' })
const footer = css({ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' })
const success = css({ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500, color: 'var(--green-600)' })
const failure = css({ fontSize: '0.875rem', lineHeight: '1.25rem', color: 'var(--destructive)' })
const empty = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--muted-foreground)',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  padding: '4rem 0',
})

const removeButton: ButtonOptions = {
  variant: 'ghost',
  size: 'icon',
  extra: { height: '1.5rem', width: '1.5rem', color: 'var(--muted-foreground)', '&:hover': { background: 'var(--accent)', color: 'var(--destructive)' } },
}
const smallIcon: ButtonOptions = { variant: 'ghost', size: 'icon', extra: { height: '1.5rem', width: '1.5rem', flexShrink: 0 } }
const changeMobile: ButtonOptions = { variant: 'ghost', size: 'icon', extra: { height: '1.75rem', width: '1.75rem', flexShrink: 0 } }
const linkButton: ButtonOptions = { variant: 'outline', size: 'sm', extra: { height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem', gap: '0.375rem' } }
const linkButtonFull: ButtonOptions = { ...linkButton, extra: { ...linkButton.extra, width: '100%' } }

// ConsolidatedList.tsx: the merged shopping list for the selected meals. Exclusions are
// client-only, as in the source; the server recomputes the cart from the meal ids.
export const ConsolidatedList = clientEntry(import.meta.url, function ConsolidatedList(handle: Handle<ConsolidatedListProps>) {
  let excluded = new Set<string>()
  let adding = false
  let updating = false
  let result: string | null = handle.props.result ?? null
  let error: string | null = handle.props.error ?? null

  handle.frame.addEventListener('reloadStart', () => {
    updating = true
    handle.update()
  }, { signal: handle.signal })
  handle.frame.addEventListener('reloadComplete', () => {
    updating = false
    handle.update()
  }, { signal: handle.signal })

  function toggle(name: string, exclude: boolean) {
    if (exclude) excluded.add(name)
    else excluded.delete(name)
    handle.update()
  }

  async function link(item: ConsolidatedItem, product: Product) {
    if (!product.upc) return
    let { linkAction, mealIds } = handle.props
    let response = await post(linkAction, {
      name: item.name,
      meal: mealIds.map(String),
      productId: product.upc,
      productName: product.description,
    })
    if (!response.ok) {
      error = response.error
      handle.update()
    }
  }

  async function addToCart(form: HTMLFormElement, signal: AbortSignal) {
    adding = true
    result = null
    error = null
    handle.update()
    try {
      let response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
        signal,
      })
      let data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
      if (response.ok && data?.message) result = data.message
      else error = data?.error ?? `Failed to add to cart (${response.status})`
    } catch (caught) {
      if (signal.aborted) return
      error = caught instanceof Error ? caught.message : 'Failed to add to cart'
    }
    adding = false
    handle.update()
  }

  return () => {
    let { items, mealIds, hasKrogerAuth, cartAction, productsUrl } = handle.props
    let active = items.filter((item) => !excluded.has(item.name))
    let excludedItems = items.filter((item) => excluded.has(item.name))
    let linkedCount = active.filter((item) => item.krogerProductId).length
    let unlinkedCount = active.length - linkedCount

    let search = (item: ConsolidatedItem, trigger: ButtonOptions, label: string | null, title?: string) => (
      <ProductSearch
        productsUrl={productsUrl}
        initialQuery={item.name}
        trigger={trigger}
        triggerTitle={title}
        triggerContent={
          label ? (
            <>
              <LinkIcon />
              {label}
            </>
          ) : (
            <LinkIcon />
          )
        }
        onSelect={(product) => link(item, product)}
      />
    )
    let removeFromCart = (item: ConsolidatedItem, revealed: boolean) => (
      <button
        type="button"
        title="Remove from cart"
        data-reveal={revealed ? '' : undefined}
        mix={[button(removeButton), on('click', () => toggle(item.name, true))]}
      >
        <X />
      </button>
    )
    let restore = (item: ConsolidatedItem) => (
      <button type="button" title="Restore" mix={[button(smallIcon), on('click', () => toggle(item.name, false))]}>
        <RotateCcw />
      </button>
    )

    return (
      <>
        <h2 mix={sectionLabel}>
          Consolidated Ingredients
          {updating && <span mix={css({ marginLeft: '0.5rem', fontSize: '0.75rem', textTransform: 'none', fontWeight: 400 })}>(updating...)</span>}
        </h2>
        {items.length === 0 ? (
          <div mix={empty}>Select meals on the left to see consolidated ingredients.</div>
        ) : (
          <div mix={css({ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' })}>
            <div mix={mobileList}>
              {active.map((item) => (
                <div key={item.name} mix={mobileCard}>
                  <div mix={between}>
                    <span mix={textSmMedium}>{item.name}</span>
                    <div mix={css({ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 })}>
                      {item.quantity && item.quantity !== '1' && <span mix={badge('secondary')}>{item.quantity}</span>}
                      {removeFromCart(item, false)}
                    </div>
                  </div>
                  <div>
                    {item.krogerProductName ? (
                      <div mix={css({ display: 'flex', alignItems: 'center', gap: '0.5rem' })}>
                        <span mix={productLine}>{item.krogerProductName}</span>
                        {search(item, changeMobile, null, 'Change product')}
                      </div>
                    ) : (
                      search(item, linkButtonFull, 'Link Kroger product')
                    )}
                  </div>
                </div>
              ))}
              {excludedItems.length > 0 && (
                <div mix={excludedCard}>
                  <p mix={excludedLabel}>Excluded from cart ({excludedItems.length})</p>
                  {excludedItems.map((item) => (
                    <div key={item.name} mix={between}>
                      <span mix={struck}>{item.name}</span>
                      {restore(item)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div mix={desktopTable}>
              <div mix={table.wrapper}>
                <table mix={table.table}>
                  <thead>
                    <tr mix={css({ borderBottomWidth: '1px' })}>
                      <th mix={table.head}>Ingredient</th>
                      <th mix={table.head}>Qty</th>
                      <th mix={table.head}>Kroger Product</th>
                      <th mix={[table.head, css({ width: '2rem' })]} />
                    </tr>
                  </thead>
                  <tbody mix={table.bodyLastRow}>
                    {active.map((item) => (
                      <tr key={item.name} mix={groupRow}>
                        <td mix={cellMedium}>{item.name}</td>
                        <td mix={table.cell}>
                          {item.quantity ? (
                            <span mix={badge('secondary')}>{item.quantity}</span>
                          ) : (
                            <span mix={css({ color: 'var(--muted-foreground)', fontSize: '0.75rem' })}>—</span>
                          )}
                        </td>
                        <td mix={table.cell}>
                          {item.krogerProductName ? (
                            <div mix={css({ display: 'flex', alignItems: 'center', gap: '0.5rem' })}>
                              <span mix={textSm}>{item.krogerProductName}</span>
                              <span data-reveal>{search(item, smallIcon, null, 'Change product')}</span>
                            </div>
                          ) : (
                            search(item, linkButton, 'Link product')
                          )}
                        </td>
                        <td mix={table.cell}>{removeFromCart(item, true)}</td>
                      </tr>
                    ))}
                    {excludedItems.length > 0 && (
                      <>
                        <tr mix={css({ borderBottomWidth: '1px' })}>
                          <td colSpan={4} mix={css({ padding: '0.25rem 1rem', verticalAlign: 'middle' })}>
                            <p mix={excludedLabelPlain}>Excluded from cart</p>
                          </td>
                        </tr>
                        {excludedItems.map((item) => (
                          <tr key={`excluded-${item.name}`} mix={excludedRow}>
                            <td colSpan={3} mix={cellStruck}>
                              {item.name}
                            </td>
                            <td mix={table.cell}>{restore(item)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <form
              method="post"
              action={cartAction}
              mix={[
                footer,
                on('submit', (event, signal) => {
                  event.preventDefault()
                  if (!adding) addToCart(event.currentTarget, signal)
                }),
              ]}
            >
              {mealIds.map((id) => (
                <input key={id} type="hidden" name="meal" value={String(id)} />
              ))}
              {excludedItems.map((item) => (
                <input key={item.name} type="hidden" name="exclude" value={item.name} />
              ))}
              {!hasKrogerAuth && (
                <div role="alert" mix={alert('destructive')}>
                  <AlertTriangle />
                  <div mix={alertDescription}>Kroger account not connected. Go to Settings to connect.</div>
                </div>
              )}
              {unlinkedCount > 0 && (
                <div role="alert" mix={alert('default')}>
                  <AlertTriangle />
                  <div mix={alertDescription}>
                    {unlinkedCount} ingredient{unlinkedCount !== 1 ? 's' : ''} without a linked product will not be added to cart.
                  </div>
                </div>
              )}
              {result && <p mix={success}>{result}</p>}
              {error && <p mix={failure}>{error}</p>}
              <button
                type="submit"
                disabled={adding || !hasKrogerAuth || linkedCount === 0}
                mix={button({ extra: { width: '100%', gap: '1rem' } })}
              >
                {adding ? <Loader spin /> : <ShoppingCart />}
                Add {linkedCount} item{linkedCount !== 1 ? 's' : ''} to Kroger Cart
              </button>
            </form>
          </div>
        )}
      </>
    )
  }
})
