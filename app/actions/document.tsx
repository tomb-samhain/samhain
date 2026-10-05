import type { Handle, RemixNode } from 'remix/component'
import { css } from 'remix/component'
import { ImportMap } from 'remix/component/server'

import { scriptEntry } from '../assets.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
  // Lets a section (like /groceries) scope its own stylesheet under the global theme.
  bodyClass?: string
}

// Global theme sampled from Type O Negative's "October Rust" (1996) cover:
// thorned green stems on a black field, with rust-orange type.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&family=Archivo:wght@400;600&display=swap'

const DISPLAY_FONT = "'Syncopate', 'Archivo Black', 'Arial Black', sans-serif"
const BODY_FONT = "'Archivo', ui-sans-serif, system-ui, sans-serif"

const themeStyle = css({
  '--surface-0': '#000000',
  '--surface-3': '#0e140a',
  '--surface-4': '#1c2613',
  '--border': '#303d1d',
  '--text-primary': '#b5cd9a',
  '--text-secondary': '#88a36f',
  '--text-tertiary': '#5f7446',
  '--accent': '#ca7928',
  '--font-display': DISPLAY_FONT,
  '--font-body': BODY_FONT,
  margin: 0,
  background: 'var(--surface-0)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  '& ::selection': { background: 'var(--accent)', color: 'var(--surface-0)' },
})

const DEFAULT_TITLE = readAppDisplayName('Samhain')

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title = DEFAULT_TITLE, bodyClass } = handle.props
    let { href, importMap, preloads } = scriptEntry

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="dark" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <title>{title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={FONTS_HREF} />
          {head}
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel="modulepreload" href={preloadHref} />
          ))}
          <script type="module" src={href}></script>
        </head>
        <body class={bodyClass} mix={themeStyle}>
          {children}
        </body>
      </html>
    )
  }
}

function readAppDisplayName(value: string): string {
  return value.startsWith('%%') ? 'Remix App' : decodeURIComponent(value)
}
