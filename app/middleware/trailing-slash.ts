import type { Middleware } from 'remix/router'

// Redirects /path/ to /path. The Spring app was served at /groceries/, so existing
// bookmarks and the old SPA's URLs end in a slash.
export function stripTrailingSlash(): Middleware {
  return (context, next) => {
    let { pathname, search } = context.url
    if (pathname.length > 1 && pathname.endsWith('/') && (context.method === 'GET' || context.method === 'HEAD')) {
      return new Response(null, { status: 308, headers: { Location: pathname.replace(/\/+$/, '') + search } })
    }
    return next()
  }
}
