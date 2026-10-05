import { redirect } from 'remix/response/redirect'

// Helpers for reading browser form submissions in groceries actions.

export function formText(formData: FormData, name: string): string {
  let value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export function formIds(values: Iterable<FormDataEntryValue | string>): number[] {
  let ids: number[] = []
  for (let value of values) {
    let id = typeof value === 'string' ? Number(value) : NaN
    if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function parseId(value: string): number | null {
  let id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

// Client entries submit with fetch and ask for JSON so they can show errors inline;
// plain form posts get the re-rendered page instead.
export function wantsJson(request: Request) {
  return request.headers.get('Accept')?.includes('application/json') ?? false
}

// Finishes a mutation: JSON callers get the destination, browsers get Post/Redirect/Get.
export function done(request: Request, location: string) {
  return wantsJson(request) ? Response.json({ location }) : redirect(location, 303)
}

export function failJson(error: string, status = 400) {
  return Response.json({ error }, { status })
}
