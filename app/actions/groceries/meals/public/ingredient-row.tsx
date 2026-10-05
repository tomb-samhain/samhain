import { clientEntry, css, on, ref } from 'remix/component'
import type { Handle } from 'remix/component'

import { ProductSearch, type Product } from '../../public/product-search.tsx'
import { post } from '../../public/submit.ts'
import { Check, LinkIcon, Pencil, Trash, X } from '../../public/ui/icons.tsx'
import { badge, button, input, md } from '../../public/ui/styles.ts'

export interface IngredientRowProps {
  ingredient: { id: number; name: string; quantity: string | null; productName: string | null }
  updateAction: string
  deleteAction: string
  linkAction: string
  productsUrl: string
}

// Desktop-only and mobile-only pieces, mirroring the source's `hidden md:flex` pairs.
const desktopOnly = { display: 'none', [md]: { display: 'flex' } }
const mobileOnly = { display: 'flex', [md]: { display: 'none' } }

const rowStyle = css({
  padding: '0.375rem 0',
  // `group-hover:opacity-100` for the hover-revealed buttons (also on keyboard focus).
  '& [data-reveal]': { opacity: 0, transition: 'opacity 150ms' },
  '&:hover [data-reveal], &:focus-within [data-reveal]': { opacity: 1 },
})
const mainLine = css({ display: 'flex', alignItems: 'center', gap: '0.5rem' })
const nameStyle = css({ flex: 1, fontSize: '0.875rem', lineHeight: '1.25rem', minWidth: 0 })
const productNameDesktop = css({
  display: 'none',
  fontSize: '0.75rem',
  lineHeight: '1rem',
  color: 'var(--muted-foreground)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '140px',
  [md]: { display: 'inline' },
})
const desktopGroup = css({ ...desktopOnly, alignItems: 'center', gap: '0.25rem' })
const mobileGroup = css({ ...mobileOnly, alignItems: 'center', gap: '0.125rem' })
const mobileSecondLine = css({ ...mobileOnly, marginLeft: '2.5rem', marginTop: '0.125rem' })
const mobileSecondLineButton = css({ ...mobileOnly, marginLeft: '2.5rem', marginTop: '0.25rem' })

const iconSm: Parameters<typeof button>[0] = {
  variant: 'ghost',
  size: 'icon',
  extra: { height: '1.5rem', width: '1.5rem' },
}
const iconMd: Parameters<typeof button>[0] = {
  variant: 'ghost',
  size: 'icon',
  extra: { height: '2rem', width: '2rem' },
}
const destructiveExtra = {
  color: 'var(--destructive)',
  '&:hover': { background: 'var(--accent-surface)', color: 'var(--destructive)' },
}
const linkButton: Parameters<typeof button>[0] = {
  variant: 'outline',
  size: 'sm',
  extra: {
    height: '1.75rem',
    fontSize: '0.75rem',
    lineHeight: '1rem',
    gap: '0.375rem',
    flexShrink: 0,
  },
}

const rowError = css({
  fontSize: '0.75rem',
  lineHeight: '1rem',
  marginTop: '0.25rem',
  color: 'var(--destructive)',
})

const qtyBadge = badge('secondary', {
  flexShrink: 0,
  cursor: 'pointer',
  '&:hover': { background: 'color-mix(in oklab, var(--secondary) 60%, transparent)' },
})
const addQtyBadge = badge('outline', {
  flexShrink: 0,
  cursor: 'pointer',
  color: 'var(--muted-foreground)',
  '&:hover': {
    color: 'var(--foreground)',
    borderColor: 'color-mix(in oklab, var(--foreground) 40%, transparent)',
  },
})

// IngredientRow.tsx: quantity badge with inline editing, full edit mode, delete, and
// Kroger product linking. Hover-revealed buttons on desktop, always visible on mobile.
export const IngredientRow = clientEntry(
  import.meta.url,
  function IngredientRow(handle: Handle<IngredientRowProps>) {
    let editing = false
    let editName = ''
    let editQty = ''
    let editingQty = false
    let qtyDraft = ''
    let qtyInput: HTMLInputElement | undefined
    let error: string | null = null

    async function save(fields: Record<string, string>, signal: AbortSignal) {
      error = null
      let result = await post(handle.props.updateAction, fields, signal, () => {
        editing = false
        editingQty = false
        handle.update()
      })
      if (result.ok || signal.aborted) return
      error = result.error
      handle.update()
    }

    async function remove(signal: AbortSignal) {
      let result = await post(handle.props.deleteAction, {}, signal)
      if (signal.aborted || result.ok) return
      error = result.error
      handle.update()
    }

    async function link(product: Product) {
      if (!product.upc) return
      let result = await post(handle.props.linkAction, {
        productId: product.upc,
        productName: product.description,
      })
      if (!result.ok) {
        error = result.error
        handle.update()
      }
    }

    function startEdit() {
      let { ingredient } = handle.props
      editing = true
      editName = ingredient.name
      editQty = ingredient.quantity ?? ''
      error = null
      handle.update()
    }

    async function startQtyEdit() {
      qtyDraft = handle.props.ingredient.quantity ?? ''
      editingQty = true
      error = null
      await handle.update()
      qtyInput?.focus()
    }

    function cancelQty() {
      editingQty = false
      handle.update()
    }

    return () => {
      let { ingredient, productsUrl } = handle.props

      if (editing) {
        return (
          <div
            mix={css({
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.25rem 0',
            })}
          >
            <input
              value={editQty}
              placeholder="qty"
              aria-label="Quantity"
              mix={[
                input({ height: '1.75rem', width: '5rem', fontSize: '0.875rem' }),
                on('input', (e) => {
                  editQty = e.currentTarget.value
                }),
              ]}
            />
            <input
              value={editName}
              placeholder="name"
              aria-label="Name"
              mix={[
                input({ height: '1.75rem', flex: 1, fontSize: '0.875rem' }),
                on('input', (e) => {
                  editName = e.currentTarget.value
                }),
              ]}
            />
            <button
              type="button"
              title="Save"
              mix={[
                button({ ...iconSm, extra: { height: '1.75rem', width: '1.75rem' } }),
                on('click', (_e, signal) => save({ name: editName, quantity: editQty }, signal)),
              ]}
            >
              <Check />
            </button>
            <button
              type="button"
              title="Cancel"
              mix={[
                button({ ...iconSm, extra: { height: '1.75rem', width: '1.75rem' } }),
                on('click', () => {
                  editing = false
                  handle.update()
                }),
              ]}
            >
              <X />
            </button>
          </div>
        )
      }

      let qtyArea = editingQty ? (
        <div mix={css({ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 })}>
          <input
            value={qtyDraft}
            placeholder="qty"
            aria-label="Quantity"
            mix={[
              input({
                height: '1.5rem',
                width: '4rem',
                fontSize: '0.75rem',
                lineHeight: '1rem',
                padding: '0 0.375rem',
              }),
              on('input', (e) => {
                qtyDraft = e.currentTarget.value
              }),
              on('keydown', (e, signal) => {
                if (e.key === 'Enter') save({ quantity: qtyDraft }, signal)
                if (e.key === 'Escape') cancelQty()
              }),
              ref((node) => (qtyInput = node as HTMLInputElement)),
            ]}
          />
          <button
            type="button"
            title="Save quantity"
            mix={[
              button(iconSm),
              on('click', (_e, signal) => save({ quantity: qtyDraft }, signal)),
            ]}
          >
            <Check />
          </button>
          <button type="button" title="Cancel" mix={[button(iconSm), on('click', cancelQty)]}>
            <X />
          </button>
        </div>
      ) : ingredient.quantity ? (
        <button
          type="button"
          title="Click to edit quantity"
          mix={[qtyBadge, on('click', startQtyEdit)]}
        >
          {ingredient.quantity}
        </button>
      ) : (
        <button type="button" title="Add quantity" mix={[addQtyBadge, on('click', startQtyEdit)]}>
          + qty
        </button>
      )

      let editButton = (size: typeof iconSm) => (
        <button type="button" title="Edit" mix={[button(size), on('click', startEdit)]}>
          <Pencil />
        </button>
      )
      let deleteButton = (size: typeof iconSm) => (
        <button
          type="button"
          title="Delete"
          mix={[
            button({ ...size, extra: { ...size.extra, ...destructiveExtra } }),
            on('click', (_e, signal) => remove(signal)),
          ]}
        >
          <Trash />
        </button>
      )
      let search = (
        slot: string,
        trigger: typeof iconSm,
        content: 'icon' | 'label',
        title?: string,
      ) => (
        <ProductSearch
          id={`product-search-${ingredient.id}-${slot}`}
          productsUrl={productsUrl}
          initialQuery={ingredient.name}
          trigger={trigger}
          triggerTitle={title}
          triggerContent={
            content === 'icon' ? (
              <LinkIcon />
            ) : (
              <>
                <LinkIcon />
                Link product
              </>
            )
          }
          onSelect={link}
        />
      )

      return (
        <div mix={rowStyle}>
          <div mix={mainLine}>
            {qtyArea}
            <span mix={nameStyle}>{ingredient.name}</span>

            {ingredient.productName ? (
              <>
                <span mix={productNameDesktop}>{ingredient.productName}</span>
                <div data-reveal mix={desktopGroup}>
                  {editButton(iconSm)}
                  {search('desktop', iconSm, 'icon', 'Change product')}
                  {deleteButton(iconSm)}
                </div>
                <div mix={mobileGroup}>
                  {editButton(iconMd)}
                  {search('mobile', iconMd, 'icon', 'Change product')}
                  {deleteButton(iconMd)}
                </div>
              </>
            ) : (
              <>
                <div mix={desktopGroup}>
                  {search('desktop', linkButton, 'label')}
                  <div
                    data-reveal
                    mix={css({ display: 'flex', alignItems: 'center', gap: '0.25rem' })}
                  >
                    {editButton(iconSm)}
                    {deleteButton(iconSm)}
                  </div>
                </div>
                <div mix={mobileGroup}>
                  {editButton(iconMd)}
                  {deleteButton(iconMd)}
                </div>
              </>
            )}
          </div>

          {ingredient.productName ? (
            <div mix={mobileSecondLine}>
              <span
                mix={css({
                  fontSize: '0.75rem',
                  lineHeight: '1rem',
                  color: 'var(--muted-foreground)',
                })}
              >
                {ingredient.productName}
              </span>
            </div>
          ) : (
            <div mix={mobileSecondLineButton}>
              {search(
                'mobile',
                { ...linkButton, extra: { ...linkButton.extra, flexShrink: 1 } },
                'label',
              )}
            </div>
          )}

          {error && (
            <p role="alert" mix={rowError}>
              {error}
            </p>
          )}
        </div>
      )
    }
  },
)
