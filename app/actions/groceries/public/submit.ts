import { navigate } from 'remix/component'

export type SubmitResult = { ok: true } | { ok: false; error: string }
export type SendResult = { ok: true; location: string } | { ok: false; error: string }

// Posts to a groceries action from a client entry. Actions answer JSON requests with
// `{ location }` on success or `{ error }` on failure (see app/actions/groceries/form.ts),
// so the component can show errors inline and then navigate without a document load.
//
// `before` runs after the server accepted the change and before navigating, which is
// where dialogs close and edit modes reset: navigation re-renders the page and aborts
// the event handler's signal.
export async function post(
  url: string,
  body: FormData | Record<string, string | string[]>,
  signal?: AbortSignal,
  before?: () => void,
): Promise<SubmitResult> {
  let result = await send(url, body, signal)
  if (!result.ok) return result
  before?.()
  await go(result.location)
  return { ok: true }
}

export async function send(
  url: string,
  body: FormData | Record<string, string | string[]>,
  signal?: AbortSignal,
): Promise<SendResult> {
  let formData = body instanceof FormData ? body : toFormData(body)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    return { ok: false, error: 'Network error — please try again.' }
  }

  if (response.status === 401) {
    window.location.assign(
      `/groceries/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
    )
    return { ok: false, error: 'Unauthorized' }
  }

  let data = (await response.json().catch(() => null)) as {
    location?: string
    error?: string
  } | null
  if (!response.ok || !data?.location) {
    return { ok: false, error: data?.error ?? `Request failed (${response.status})` }
  }

  return { ok: true, location: data.location }
}

// Same-page destinations replace the history entry and keep the scroll position.
export async function go(href: string) {
  let target = new URL(href, location.href)
  let same = target.pathname + target.search === location.pathname + location.search
  await navigate(target.pathname + target.search, {
    history: same ? 'replace' : 'push',
    resetScroll: !same,
  })
}

export function submitForm(form: HTMLFormElement, signal?: AbortSignal, before?: () => void) {
  return post(form.action, new FormData(form), signal, before)
}

function toFormData(fields: Record<string, string | string[]>) {
  let formData = new FormData()
  for (let [name, value] of Object.entries(fields)) {
    for (let v of Array.isArray(value) ? value : [value]) formData.append(name, v)
  }
  return formData
}
