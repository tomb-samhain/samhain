import { css, on, ref } from 'remix/component'
import type { Handle, RemixNode } from 'remix/component'

import { Loader, Search } from './ui/icons.tsx'
import { placePopover } from './ui/overlays.ts'
import { button, input, popoverContent, textXsDestructive, textXsMuted, type ButtonOptions } from './ui/styles.ts'

export interface Product {
  productId: string
  upc: string | null
  description: string
  price: number | null
  imageUrl: string | null
}

export interface ProductSearchProps {
  productsUrl: string
  initialQuery: string
  trigger: ButtonOptions
  triggerContent: RemixNode
  triggerTitle?: string
  onSelect(product: Product): void
}

const contentStyle = popoverContent({ width: '20rem', maxWidth: 'calc(100vw - 2rem)', padding: '0.75rem' })
const searchInput = input({ height: '2rem', fontSize: '0.875rem' })
const searchButton = button({ variant: 'outline', size: 'sm' })
const resultsList = css({ maxHeight: '13rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' })
const noResults = css({ fontSize: '0.75rem', lineHeight: '1rem', color: 'var(--muted-foreground)', textAlign: 'center', padding: '0.5rem 0' })
const resultButton = css({
  width: '100%',
  textAlign: 'left',
  padding: '0.375rem 0.5rem',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  borderRadius: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  cursor: 'pointer',
  transition: 'background-color 150ms',
  '&:hover': { background: 'var(--accent)' },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
})

// ProductSearchPopover.tsx: searches Kroger as soon as it opens, prefilled with the
// ingredient name. Results are cached per term while the page is open.
export function ProductSearch(handle: Handle<ProductSearchProps>) {
  let trigger: HTMLButtonElement | undefined
  let popover: HTMLElement | undefined
  let query = ''
  let submitted = ''
  let results: Product[] = []
  let hasLocation = true
  let loading = false
  let error: string | null = null
  let controller: AbortController | undefined
  let cache = new Map<string, { products: Product[]; hasLocation: boolean; at: number }>()

  async function search(term: string) {
    term = term.trim()
    if (!term) return
    submitted = term
    error = null
    controller?.abort()

    let cached = cache.get(term)
    if (cached && Date.now() - cached.at < 60_000) {
      results = cached.products
      hasLocation = cached.hasLocation
      loading = false
      handle.update()
      return
    }

    let current = (controller = new AbortController())
    loading = true
    handle.update()
    try {
      let url = new URL(handle.props.productsUrl, location.href)
      url.searchParams.set('term', term)
      let response = await fetch(url, { headers: { Accept: 'application/json' }, signal: current.signal })
      let data = (await response.json().catch(() => null)) as
        | { products: Product[]; hasLocation: boolean; error?: undefined }
        | { error: string }
        | null
      if (current.signal.aborted) return
      if (!response.ok || !data || 'error' in data) {
        results = []
        error = (data && 'error' in data && data.error) || `Search failed (${response.status})`
      } else {
        results = data.products
        hasLocation = data.hasLocation
        cache.set(term, { products: data.products, hasLocation: data.hasLocation, at: Date.now() })
      }
    } catch (caught) {
      if (current.signal.aborted) return
      results = []
      error = caught instanceof Error ? caught.message : 'Search failed'
    }
    loading = false
    handle.update()
  }

  function onToggle(event: Event) {
    let open = (event as ToggleEvent).newState === 'open'
    query = handle.props.initialQuery
    if (open) {
      if (trigger && popover) placePopover(popover, trigger, 'start')
      search(query)
    } else {
      controller?.abort()
      submitted = ''
      results = []
      error = null
      loading = false
      handle.update()
    }
  }

  return () => {
    let { trigger: triggerOptions, triggerContent, triggerTitle, onSelect } = handle.props
    return (
      <>
        <button
          type="button"
          title={triggerTitle}
          aria-haspopup="dialog"
          mix={[
            button(triggerOptions),
            ref((node) => (trigger = node as HTMLButtonElement)),
            on('click', () => {
              popover?.togglePopover()
            }),
          ]}
        >
          {triggerContent}
        </button>
        <div
          popover="auto"
          role="dialog"
          aria-label="Search Kroger products"
          mix={[
            contentStyle,
            ref((node, signal) => {
              popover = node as HTMLElement
              popover.addEventListener('toggle', onToggle, { signal })
            }),
          ]}
        >
          <div mix={css({ display: 'flex', flexDirection: 'column', gap: '0.5rem' })}>
            <div mix={css({ display: 'flex', gap: '0.5rem' })}>
              <input
                type="search"
                placeholder="Search Kroger products..."
                aria-label="Search Kroger products"
                value={query}
                autofocus
                mix={[
                  searchInput,
                  on('input', (event) => {
                    query = event.currentTarget.value
                    handle.update()
                  }),
                  on('keydown', (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      search(query)
                    }
                  }),
                ]}
              />
              <button
                type="button"
                aria-label="Search"
                disabled={loading}
                mix={[searchButton, on('click', () => search(query))]}
              >
                {loading ? <Loader spin /> : <Search />}
              </button>
            </div>
            {error && <p mix={textXsDestructive}>{error}</p>}
            {results.length > 0 && (
              <>
                {!hasLocation && (
                  <p mix={textXsMuted}>Set a store location in Settings to see prices and enable linking.</p>
                )}
                <ul mix={resultsList}>
                  {results.map((product) => (
                    <li key={product.productId}>
                      <button
                        type="button"
                        disabled={!product.upc}
                        title={product.upc ? undefined : 'No UPC — set a store location in Settings'}
                        mix={[
                          resultButton,
                          on('click', () => {
                            popover?.hidePopover()
                            onSelect(product)
                          }),
                        ]}
                      >
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt=""
                            mix={css({ width: '2.5rem', height: '2.5rem', objectFit: 'contain', flexShrink: 0, borderRadius: '0.25rem' })}
                          />
                        )}
                        <span mix={css({ flex: 1, minWidth: 0 })}>
                          <span mix={css({ display: 'block', fontWeight: 500, lineHeight: 1.25 })}>{product.description}</span>
                          {product.price != null && <span mix={textXsMuted}>${product.price.toFixed(2)}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {results.length === 0 && !loading && !error && submitted && (
              <p mix={noResults}>No results</p>
            )}
          </div>
        </div>
      </>
    )
  }
}
