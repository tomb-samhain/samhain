import * as assert from 'remix/assert'
import { render } from 'remix/component/test'
import { describe, it } from 'remix/test'

import { IngredientRow } from './public/ingredient-row.tsx'
import { MealCardMenu } from './public/meal-card-menu.tsx'
import { NewMealButton } from './public/new-meal-button.tsx'

interface Call {
  url: string
  body: FormData
  accept: string | null
}

// Replaces fetch for one test; every call answers with `respond(call)`.
function mockFetch(t: { after(fn: () => void): void }, respond: (call: Call) => Response) {
  let calls: Call[] = []
  let original = window.fetch
  window.fetch = async (input, init) => {
    let call = {
      url: String(input),
      body: init?.body as FormData,
      accept: new Headers(init?.headers).get('Accept'),
    }
    calls.push(call)
    return respond(call)
  }
  t.after(() => {
    window.fetch = original
  })
  return calls
}

async function settle(act: (fn: () => unknown) => Promise<void>) {
  for (let i = 0; i < 5; i++) await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

function q<T extends Element = HTMLElement>(selector: string) {
  return document.querySelector<T>(selector)
}

function qa<T extends Element = HTMLElement>(selector: string) {
  return document.querySelectorAll<T>(selector)
}

function byText(root: ParentNode, selector: string, text: string) {
  return [...root.querySelectorAll<HTMLElement>(selector)].find((node) => node.textContent?.trim() === text)
}

const ingredient = { id: 7, name: 'ground beef', quantity: '2 lb', productName: null }
const rowProps = {
  updateAction: '/groceries/meals/1/ingredients/7',
  deleteAction: '/groceries/meals/1/ingredients/7/delete',
  linkAction: '/groceries/meals/1/ingredients/7/link',
  productsUrl: '/groceries/kroger/products',
}

describe('IngredientRow', () => {
  it('shows the quantity badge, name, and link button', (t) => {
    let { $, cleanup } = render(<IngredientRow ingredient={ingredient} {...rowProps} />)
    t.after(cleanup)
    assert.equal($('[title="Click to edit quantity"]')?.textContent, '2 lb')
    assert.ok(byText(document, 'span', 'ground beef'))
    assert.ok([...document.querySelectorAll('button')].some((b) => b.textContent === 'Link product'))
  })

  it('shows "+ qty" when there is no quantity', (t) => {
    let { $, cleanup } = render(<IngredientRow ingredient={{ ...ingredient, quantity: null }} {...rowProps} />)
    t.after(cleanup)
    assert.equal($('[title="Add quantity"]')?.textContent, '+ qty')
  })

  it('edits the quantity inline with a focused input and cancels with Escape', async (t) => {
    let { $, act, cleanup } = render(<IngredientRow ingredient={ingredient} {...rowProps} />)
    t.after(cleanup)

    await act(() => q<HTMLElement>('[title="Click to edit quantity"]')!.click())
    let input = q<HTMLInputElement>('input[aria-label="Quantity"]')!
    assert.equal(input.value, '2 lb')
    assert.equal(document.activeElement, input)

    await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal($('input[aria-label="Quantity"]'), null)
    assert.equal($('[title="Click to edit quantity"]')?.textContent, '2 lb')
  })

  it('posts the new quantity as JSON-accepting form data and shows server errors', async (t) => {
    let calls = mockFetch(t, () => Response.json({ error: 'Enter an ingredient name.' }, { status: 400 }))
    let { $, act, cleanup } = render(<IngredientRow ingredient={ingredient} {...rowProps} />)
    t.after(cleanup)

    await act(() => q<HTMLElement>('[title="Click to edit quantity"]')!.click())
    let input = q<HTMLInputElement>('input[aria-label="Quantity"]')!
    input.value = '3 lb'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    await settle(act)

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, rowProps.updateAction)
    assert.equal(calls[0].accept, 'application/json')
    assert.equal(calls[0].body.get('quantity'), '3 lb')
    assert.equal(calls[0].body.has('name'), false)
    assert.equal($('[role="alert"]')?.textContent, 'Enter an ingredient name.')
    // Still editing so the user can fix it.
    assert.ok($('input[aria-label="Quantity"]'))
  })

  it('opens full edit mode with the current values', async (t) => {
    let { $, act, cleanup } = render(<IngredientRow ingredient={ingredient} {...rowProps} />)
    t.after(cleanup)
    await act(() => q<HTMLElement>('[title="Edit"]')!.click())
    assert.equal(q<HTMLInputElement>('input[aria-label="Quantity"]')?.value, '2 lb')
    assert.equal(q<HTMLInputElement>('input[aria-label="Name"]')?.value, 'ground beef')

    await act(() => q<HTMLElement>('[title="Cancel"]')!.click())
    assert.equal($('input[aria-label="Name"]'), null)
  })

  it('shows the linked product name instead of the link button', (t) => {
    let { cleanup } = render(<IngredientRow ingredient={{ ...ingredient, productName: 'Kroger Ground Beef' }} {...rowProps} />)
    t.after(cleanup)
    assert.ok(byText(document, 'span', 'Kroger Ground Beef'))
    assert.ok(document.querySelector('[title="Change product"]'))
    assert.ok(![...document.querySelectorAll('button')].some((b) => b.textContent === 'Link product'))
  })
})

describe('NewMealButton', () => {
  it('opens the dialog with a focused, empty name field and a disabled Create button', async (t) => {
    let { $, act, cleanup } = render(<NewMealButton action="/groceries/meals" />)
    t.after(cleanup)

    await act(() => byText(document, 'button', 'New')!.click())
    let dialog = q<HTMLDialogElement>('dialog')!
    assert.equal(dialog.open, true)
    assert.equal(dialog.querySelector('h2')?.textContent, 'New meal')
    assert.match(dialog.textContent ?? '', /Enter a name for your new meal\./)

    let input = dialog.querySelector<HTMLInputElement>('input[name="name"]')!
    assert.equal(document.activeElement, input)
    let create = byText(dialog, 'button', 'Create') as HTMLButtonElement
    assert.equal(create.disabled, true)

    input.value = 'Soup'
    await act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
    assert.equal(create.disabled, false)

    await act(() => byText(dialog, 'button', 'Cancel')!.click())
    assert.equal(dialog.open, false)
  })

  it('keeps the dialog open and shows a duplicate-name error', async (t) => {
    mockFetch(t, () => Response.json({ error: 'You already have a meal named "Tacos".' }, { status: 400 }))
    let { $, act, cleanup } = render(<NewMealButton action="/groceries/meals" />)
    t.after(cleanup)

    await act(() => byText(document, 'button', 'New')!.click())
    let input = q<HTMLInputElement>('dialog input[name="name"]')!
    input.value = 'Tacos'
    await act(() => input.dispatchEvent(new Event('input', { bubbles: true })))
    await act(() => q<HTMLFormElement>('dialog form')!.requestSubmit())
    await settle(act)

    assert.equal(q<HTMLDialogElement>('dialog')!.open, true)
    assert.equal($('[role="alert"]')?.textContent, 'You already have a meal named "Tacos".')
  })
})

describe('MealCardMenu', () => {
  let props = {
    menuId: 'meal-menu-2',
    mealName: 'Chili',
    selected: false,
    renameAction: '/groceries/meals/2/rename',
    deleteAction: '/groceries/meals/2/delete',
    returnTo: '/groceries',
  }

  it('opens a menu with Rename and Delete', async (t) => {
    let { $, act, cleanup } = render(<MealCardMenu {...props} />)
    t.after(cleanup)
    let menu = q<HTMLElement>('[role="menu"]')!
    assert.equal(menu.matches(':popover-open'), false)

    await act(() => q<HTMLElement>('[aria-label="Options for Chili"]')!.click())
    assert.equal(menu.matches(':popover-open'), true)
    assert.deepEqual(
      [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
      ['Rename', 'Delete'],
    )
  })

  it('opens the rename dialog prefilled with the meal name', async (t) => {
    let { act, cleanup } = render(<MealCardMenu {...props} />)
    t.after(cleanup)
    await act(() => q<HTMLElement>('[aria-label="Options for Chili"]')!.click())
    await act(() => byText(document, '[role="menuitem"]', 'Rename')!.click())

    let [rename] = [...qa<HTMLDialogElement>('dialog')]
    assert.equal(rename.open, true)
    assert.match(rename.textContent ?? '', /Enter a new name for "Chili"\./)
    assert.equal(rename.querySelector<HTMLInputElement>('input[name="name"]')?.value, 'Chili')
    assert.equal(rename.querySelector<HTMLInputElement>('input[name="returnTo"]')?.value, '/groceries')
  })

  it('asks for confirmation before deleting', async (t) => {
    let { act, cleanup } = render(<MealCardMenu {...props} />)
    t.after(cleanup)
    await act(() => q<HTMLElement>('[aria-label="Options for Chili"]')!.click())
    await act(() => byText(document, '[role="menuitem"]', 'Delete')!.click())

    let remove = [...qa<HTMLDialogElement>('dialog')][1]
    assert.equal(remove.open, true)
    assert.match(remove.textContent ?? '', /Are you sure you want to delete "Chili"\? This cannot be undone\./)
  })
})
