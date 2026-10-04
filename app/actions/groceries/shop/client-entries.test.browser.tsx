import * as assert from 'remix/assert'
import { render } from 'remix/component/test'
import { describe, it } from 'remix/test'

import { MobileNav } from '../public/mobile-nav.tsx'
import { ProductSearch, type Product } from '../public/product-search.tsx'
import { ConsolidatedList, type ConsolidatedItem } from './public/consolidated-list.tsx'
import { MealSelector } from './public/meal-selector.tsx'

function q<T extends Element = HTMLElement>(selector: string) {
  return document.querySelector<T>(selector)
}

function visibleButtons(text: string | RegExp) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) => b.checkVisibility() && (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')),
  )
}

function visibleByTitle(title: string) {
  return [...document.querySelectorAll<HTMLElement>(`[title="${title}"]`)].filter((b) => b.checkVisibility())
}

async function settle(act: (fn: () => unknown) => Promise<void>) {
  for (let i = 0; i < 5; i++) await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

function mockFetch(t: { after(fn: () => void): void }, respond: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  let urls: URL[] = []
  let original = window.fetch
  window.fetch = async (input, init) => {
    let url = new URL(String(input), location.href)
    urls.push(url)
    return respond(url, init)
  }
  t.after(() => {
    window.fetch = original
  })
  return urls
}

const items: ConsolidatedItem[] = [
  { name: 'garlic', quantity: '3', krogerProductId: 'upc-1', krogerProductName: 'Garlic Bulb' },
  { name: 'onion', quantity: '2', krogerProductId: null, krogerProductName: null },
  { name: 'olive oil', quantity: null, krogerProductId: 'upc-3', krogerProductName: 'Kirkland Olive Oil' },
]
const listProps = {
  mealIds: [1, 2],
  linkAction: '/groceries/shop/link',
  cartAction: '/groceries/shop/cart',
  productsUrl: '/groceries/kroger/products',
}

describe('ConsolidatedList', () => {
  it('shows the empty state', (t) => {
    let { cleanup } = render(<ConsolidatedList items={[]} hasKrogerAuth {...listProps} />)
    t.after(cleanup)
    assert.match(document.body.textContent ?? '', /Select meals on the left to see consolidated ingredients\./)
  })

  it('counts linked items and warns about unlinked ones', (t) => {
    let { cleanup } = render(<ConsolidatedList items={items} hasKrogerAuth {...listProps} />)
    t.after(cleanup)
    let [cart] = visibleButtons(/to Kroger Cart/)
    assert.equal(cart.textContent?.trim(), 'Add 2 items to Kroger Cart')
    assert.equal(cart.disabled, false)
    assert.match(document.body.textContent ?? '', /1 ingredient without a linked product will not be added to cart\./)
    assert.doesNotMatch(document.body.textContent ?? '', /Kroger account not connected/)
  })

  it('disables the cart without a Kroger connection', (t) => {
    let { cleanup } = render(<ConsolidatedList items={items} hasKrogerAuth={false} {...listProps} />)
    t.after(cleanup)
    assert.match(document.body.textContent ?? '', /Kroger account not connected\. Go to Settings to connect\./)
    assert.equal(visibleButtons(/to Kroger Cart/)[0].disabled, true)
  })

  it('excludes and restores items, updating counts and the submitted fields', async (t) => {
    let { act, cleanup } = render(<ConsolidatedList items={items} hasKrogerAuth {...listProps} />)
    t.after(cleanup)

    let garlicRow = [...document.querySelectorAll('tr')].find((row) => row.cells[0]?.textContent === 'garlic')!
    await act(() => garlicRow.querySelector<HTMLElement>('[title="Remove from cart"]')!.click())

    assert.match(document.body.textContent ?? '', /Excluded from cart/)
    assert.equal(visibleButtons(/to Kroger Cart/)[0].textContent?.trim(), 'Add 1 item to Kroger Cart')
    assert.deepEqual(
      [...document.querySelectorAll<HTMLInputElement>('input[name="exclude"]')].map((input) => input.value),
      ['garlic'],
    )
    assert.deepEqual(
      [...document.querySelectorAll<HTMLInputElement>('input[name="meal"]')].map((input) => input.value),
      ['1', '2'],
    )

    await act(() => visibleByTitle('Restore')[0].click())
    assert.doesNotMatch(document.body.textContent ?? '', /Excluded from cart/)
    assert.equal(visibleButtons(/to Kroger Cart/)[0].textContent?.trim(), 'Add 2 items to Kroger Cart')
  })

  it('submits the cart and shows the result', async (t) => {
    let bodies: FormData[] = []
    mockFetch(t, (_url, init) => {
      bodies.push(init?.body as FormData)
      return Response.json({ message: 'Items added to cart' })
    })
    let { act, cleanup } = render(<ConsolidatedList items={items} hasKrogerAuth {...listProps} />)
    t.after(cleanup)

    await act(() => visibleButtons(/to Kroger Cart/)[0].click())
    await settle(act)
    assert.deepEqual(bodies[0].getAll('meal'), ['1', '2'])
    assert.match(document.body.textContent ?? '', /Items added to cart/)
  })

  it('shows cart errors', async (t) => {
    mockFetch(t, () => Response.json({ error: 'Kroger session expired — please reconnect in Settings' }, { status: 409 }))
    let { act, cleanup } = render(<ConsolidatedList items={items} hasKrogerAuth {...listProps} />)
    t.after(cleanup)
    await act(() => visibleButtons(/to Kroger Cart/)[0].click())
    await settle(act)
    assert.match(document.body.textContent ?? '', /Kroger session expired — please reconnect in Settings/)
  })

  it('shows the desktop table at desktop widths', (t) => {
    let { cleanup } = render(<ConsolidatedList items={items} hasKrogerAuth {...listProps} />)
    t.after(cleanup)
    assert.equal(q('table')!.checkVisibility(), window.innerWidth >= 768)
  })
})

describe('MealSelector', () => {
  let meals = [
    { id: 2, name: 'Chili', ingredientCount: 3 },
    { id: 1, name: 'Tacos', ingredientCount: 5 },
  ]

  it('renders meals with counts and checks the selected ones', (t) => {
    let { cleanup } = render(<MealSelector action="/groceries/shop" meals={meals} selectedIds={[1]} />)
    t.after(cleanup)
    let boxes = [...document.querySelectorAll<HTMLInputElement>('input[name="meal"]')]
    assert.deepEqual(boxes.map((b) => [b.value, b.checked]), [['2', false], ['1', true]])
    assert.match(document.body.textContent ?? '', /Chili3Tacos5/)
  })

  it('submits the form when a row is clicked and hides the fallback button', async (t) => {
    let { act, cleanup } = render(<MealSelector action="/groceries/shop" meals={meals} selectedIds={[]} />)
    t.after(cleanup)
    assert.equal(visibleButtons('Update list').length, 0)

    let submitted: string[][] = []
    q<HTMLFormElement>('form')!.addEventListener('submit', (event) => {
      event.preventDefault()
      submitted.push(new FormData(event.currentTarget as HTMLFormElement).getAll('meal').map(String))
    })
    await act(() => [...document.querySelectorAll('label')].find((l) => l.textContent?.includes('Tacos'))!.click())
    assert.deepEqual(submitted, [['1']])
  })

  it('shows the empty state', (t) => {
    let { cleanup } = render(<MealSelector action="/groceries/shop" meals={[]} selectedIds={[]} />)
    t.after(cleanup)
    assert.match(document.body.textContent ?? '', /No meals yet\. Go to Meals to create some\./)
  })
})

describe('ProductSearch', () => {
  let products: Product[] = [
    { productId: 'p1', upc: '0001111', description: 'Kroger Ground Beef', price: 5.99, imageUrl: null },
    { productId: 'p2', upc: '0002222', description: 'Lean Ground Beef', price: null, imageUrl: null },
  ]

  function renderSearch(onSelect: (product: Product) => void = () => {}) {
    return render(
      <ProductSearch
        id="test-search"
        productsUrl="/groceries/kroger/products"
        initialQuery="ground beef"
        trigger={{ variant: 'outline', size: 'sm' }}
        triggerContent="Link product"
        onSelect={onSelect}
      />,
    )
  }

  it('searches for the ingredient as soon as it opens', async (t) => {
    let urls = mockFetch(t, () => Response.json({ products, hasLocation: true }))
    let { act, cleanup } = renderSearch()
    t.after(cleanup)

    await act(() => visibleButtons('Link product')[0].click())
    await settle(act)
    assert.equal(urls[0].pathname, '/groceries/kroger/products')
    assert.equal(urls[0].searchParams.get('term'), 'ground beef')
    assert.equal(q<HTMLInputElement>('input[aria-label="Search Kroger products"]')!.value, 'ground beef')
    assert.match(q('[popover]')!.textContent ?? '', /Kroger Ground Beef\$5\.99Lean Ground Beef/)
    assert.doesNotMatch(q('[popover]')!.textContent ?? '', /Set a store location/)
  })

  it('asks for a store when none is set', async (t) => {
    mockFetch(t, () => Response.json({ products, hasLocation: false }))
    let { act, cleanup } = renderSearch()
    t.after(cleanup)
    await act(() => visibleButtons('Link product')[0].click())
    await settle(act)
    assert.match(q('[popover]')!.textContent ?? '', /Set a store location in Settings to see prices and enable linking\./)
  })

  it('shows "No results" and errors', async (t) => {
    let reply = () => Response.json({ products: [], hasLocation: true })
    mockFetch(t, () => reply())
    let { act, cleanup } = renderSearch()
    t.after(cleanup)
    await act(() => visibleButtons('Link product')[0].click())
    await settle(act)
    assert.match(q('[popover]')!.textContent ?? '', /No results/)

    reply = () => Response.json({ error: 'Kroger not configured' }, { status: 409 })
    let input = q<HTMLInputElement>('input[aria-label="Search Kroger products"]')!
    input.value = 'salt'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await settle(act)
    assert.match(q('[popover]')!.textContent ?? '', /Kroger not configured/)
  })

  it('selects a product and closes', async (t) => {
    mockFetch(t, () => Response.json({ products, hasLocation: true }))
    let selected: Product[] = []
    let { act, cleanup } = renderSearch((product) => selected.push(product))
    t.after(cleanup)
    await act(() => visibleButtons('Link product')[0].click())
    await settle(act)

    await act(() => visibleButtons(/Lean Ground Beef/)[0].click())
    assert.deepEqual(selected.map((p) => p.upc), ['0002222'])
    assert.equal(q('[popover]')!.matches(':popover-open'), false)
  })
})

describe('MobileNav', () => {
  it('opens the navigation sheet with the user and sign out', async (t) => {
    let { act, cleanup } = render(<MobileNav active="shop" email="cook@example.com" logoutHref="/groceries/logout" />)
    t.after(cleanup)
    let sheet = q<HTMLDialogElement>('dialog')!
    assert.equal(sheet.open, false)

    await act(() => q<HTMLElement>('[aria-label="Open menu"]')!.click())
    assert.equal(sheet.open, true)
    assert.deepEqual(
      [...sheet.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('aria-current')]),
      [
        ['Meals', null],
        ['Shop', 'page'],
        ['Orders', null],
        ['Settings', null],
      ],
    )
    assert.match(sheet.textContent ?? '', /cook@example\.com/)
    assert.equal(sheet.querySelector('form')?.getAttribute('action'), '/groceries/logout')

    await act(() => [...sheet.querySelectorAll('button')].find((b) => b.textContent === 'Close')!.click())
    assert.equal(sheet.open, false)
  })
})
