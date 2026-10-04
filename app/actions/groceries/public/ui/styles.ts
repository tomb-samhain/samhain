import { css } from 'remix/component'

// css() ports of the source app's shadcn/ui primitives (frontend/src/components/ui/*).
// Tailwind spacing: 1 unit = 0.25rem. Breakpoint `md` = 768px.

type CSSProps = Parameters<typeof css>[0]

export const md = '@media (min-width: 768px)'
export const sm = '@media (min-width: 640px)'

const focusRing: CSSProps = {
  outline: 'none',
  boxShadow: '0 0 0 2px var(--background), 0 0 0 4px var(--ring)',
}

export function alpha(color: string, percent: number) {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`
}

// Memoizes css() mixins by their arguments so render functions can call these freely.
function memo<args extends unknown[]>(build: (...args: args) => CSSProps) {
  let cache = new Map<string, ReturnType<typeof css>>()
  return (...args: args) => {
    let key = JSON.stringify(args)
    let mixin = cache.get(key)
    if (!mixin) {
      mixin = css(build(...args))
      cache.set(key, mixin)
    }
    return mixin
  }
}

export type ButtonVariant =
  'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'green'
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

const buttonVariants: Record<ButtonVariant, CSSProps> = {
  default: {
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    '&:hover': { background: alpha('var(--primary)', 90) },
  },
  destructive: {
    background: 'var(--destructive)',
    color: 'var(--destructive-foreground)',
    '&:hover': { background: alpha('var(--destructive)', 90) },
  },
  outline: {
    border: '1px solid var(--input)',
    background: 'var(--background)',
    '&:hover': { background: 'var(--accent)', color: 'var(--accent-foreground)' },
  },
  secondary: {
    background: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
    '&:hover': { background: alpha('var(--secondary)', 80) },
  },
  ghost: {
    '&:hover': { background: 'var(--accent)', color: 'var(--accent-foreground)' },
  },
  link: {
    color: 'var(--primary)',
    textUnderlineOffset: '4px',
    '&:hover': { textDecoration: 'underline' },
  },
  // The source's `bg-green-600 hover:bg-green-700 text-white` overrides for New/Add.
  green: {
    background: 'var(--green-600)',
    color: 'white',
    '&:hover': { background: 'var(--green-700)' },
  },
}

const buttonSizes: Record<ButtonSize, CSSProps> = {
  default: { height: '2.5rem', padding: '0.5rem 1rem' },
  sm: { height: '2.25rem', padding: '0 0.75rem' },
  lg: { height: '2.75rem', padding: '0 2rem' },
  icon: { height: '2.5rem', width: '2.5rem' },
}

export interface ButtonOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  // Ad-hoc overrides from the source markup, e.g. `h-7 w-7` or `w-full`.
  extra?: CSSProps
}

export const button = memo(
  ({ variant = 'default', size = 'default', extra }: ButtonOptions = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
    borderRadius: 'calc(var(--radius) - 2px)',
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    fontWeight: 500,
    transitionProperty: 'color, background-color, border-color, opacity',
    transitionDuration: '150ms',
    cursor: 'pointer',
    textDecoration: 'none',
    '&:focus-visible': focusRing,
    '&:disabled': { pointerEvents: 'none', opacity: 0.5 },
    '& svg': { width: '1rem', height: '1rem', pointerEvents: 'none', flexShrink: 0 },
    ...buttonVariants[variant],
    ...buttonSizes[size],
    ...extra,
  }),
)

export type BadgeVariant =
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

const badgeVariants: Record<BadgeVariant, CSSProps> = {
  default: {
    borderColor: 'transparent',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  secondary: {
    borderColor: 'transparent',
    background: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
  },
  destructive: {
    borderColor: 'transparent',
    background: 'var(--destructive)',
    color: 'var(--destructive-foreground)',
  },
  outline: { color: 'var(--foreground)' },
  success: { borderColor: 'transparent', background: 'var(--green-500)', color: 'white' },
  warning: { borderColor: 'transparent', background: 'var(--yellow-500)', color: 'white' },
}

export const badge = memo((variant: BadgeVariant = 'default', extra?: CSSProps) => ({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '9999px',
  borderWidth: '1px',
  padding: '0.125rem 0.625rem',
  fontSize: '0.75rem',
  lineHeight: '1rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  transitionProperty: 'color, background-color, border-color',
  transitionDuration: '150ms',
  ...badgeVariants[variant],
  ...extra,
}))

export const input = memo((extra?: CSSProps) => ({
  display: 'flex',
  height: '2.5rem',
  width: '100%',
  borderRadius: 'calc(var(--radius) - 2px)',
  border: '1px solid var(--input)',
  background: 'var(--background)',
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  '&:focus-visible': focusRing,
  '&:disabled': { cursor: 'not-allowed', opacity: 0.5 },
  ...extra,
}))

export const card = css({
  borderRadius: 'var(--radius)',
  borderWidth: '1px',
  background: 'var(--card)',
  color: 'var(--card-foreground)',
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
})
export const cardHeader = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  padding: '1.5rem',
})
export const cardTitle = css({
  fontSize: '1.5rem',
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: '-0.025em',
})
export const cardDescription = css({
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--muted-foreground)',
})
export const cardContent = css({
  padding: '0 1.5rem 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
})

export const alert = memo((variant: 'default' | 'destructive' | 'success' = 'default') => ({
  position: 'relative',
  width: '100%',
  borderRadius: 'var(--radius)',
  borderWidth: '1px',
  padding: '1rem',
  '& > svg': { position: 'absolute', left: '1rem', top: '1rem', color: 'var(--foreground)' },
  '& > svg ~ *': { paddingLeft: '1.75rem' },
  '& > svg + div': { transform: 'translateY(-3px)' },
  ...(variant === 'default' && { background: 'var(--background)', color: 'var(--foreground)' }),
  ...(variant === 'destructive' && {
    borderColor: alpha('var(--destructive)', 50),
    color: 'var(--destructive)',
    '& > svg': { position: 'absolute', left: '1rem', top: '1rem', color: 'var(--destructive)' },
  }),
  // The source's `border-green-500 text-green-700 bg-green-50` override.
  ...(variant === 'success' && {
    borderColor: 'var(--green-500)',
    color: 'var(--green-700)',
    background: 'var(--green-50)',
    '& > svg': { position: 'absolute', left: '1rem', top: '1rem', color: 'var(--green-600)' },
  }),
}))
export const alertDescription = css({ fontSize: '0.875rem', lineHeight: '1.25rem' })

export const separator = css({
  flexShrink: 0,
  height: '1px',
  width: '100%',
  background: 'var(--border)',
})

export const label = css({ fontSize: '0.875rem', lineHeight: 1, fontWeight: 500 })

export const textMuted = css({ color: 'var(--muted-foreground)' })
export const textSmMuted = css({
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--muted-foreground)',
})
export const textXsMuted = css({
  fontSize: '0.75rem',
  lineHeight: '1rem',
  color: 'var(--muted-foreground)',
})
export const textDestructive = css({
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  color: 'var(--destructive)',
})
export const textXsDestructive = css({
  fontSize: '0.75rem',
  lineHeight: '1rem',
  color: 'var(--destructive)',
})
export const pageTitle = css({ fontSize: '1.5rem', lineHeight: '2rem', fontWeight: 700 })
export const sectionLabel = css({
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.025em',
  marginBottom: '0.75rem',
})

export const table = {
  wrapper: css({ position: 'relative', width: '100%', overflow: 'auto' }),
  table: css({ width: '100%', captionSide: 'bottom', fontSize: '0.875rem', lineHeight: '1.25rem' }),
  row: css({
    borderBottomWidth: '1px',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
    '&:hover': { background: alpha('var(--muted)', 50) },
  }),
  bodyLastRow: css({ '& tr:last-child': { borderBottomWidth: 0 } }),
  head: css({
    height: '3rem',
    padding: '0 1rem',
    textAlign: 'left',
    verticalAlign: 'middle',
    fontWeight: 500,
    color: 'var(--muted-foreground)',
  }),
  cell: css({ padding: '1rem', verticalAlign: 'middle' }),
}

// Native <dialog> styled like shadcn's DialogContent; ::backdrop replaces DialogOverlay.
export const dialog = css({
  margin: 'auto',
  width: '100%',
  maxWidth: '32rem',
  borderWidth: '1px',
  background: 'var(--background)',
  padding: '1.5rem',
  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  '&[open]': { display: 'grid', gap: '1rem' },
  '&::backdrop': { background: 'rgb(0 0 0 / 0.8)' },
  [sm]: { borderRadius: 'var(--radius)' },
})
export const dialogHeader = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  textAlign: 'center',
  [sm]: { textAlign: 'left' },
})
export const dialogTitle = css({
  fontSize: '1.125rem',
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: '-0.025em',
})
export const dialogFooter = css({
  display: 'flex',
  flexDirection: 'column-reverse',
  gap: '0.5rem',
  [sm]: { flexDirection: 'row', justifyContent: 'flex-end' },
})
export const dialogClose = css({
  position: 'absolute',
  right: '1rem',
  top: '1rem',
  borderRadius: 'calc(var(--radius) - 4px)',
  opacity: 0.7,
  cursor: 'pointer',
  transition: 'opacity 150ms',
  '&:hover': { opacity: 1 },
  '&:focus-visible': focusRing,
})

export const popoverContent = memo((extra?: CSSProps) => ({
  position: 'fixed',
  inset: 'auto',
  margin: 0,
  zIndex: 50,
  width: '18rem',
  borderRadius: 'calc(var(--radius) - 2px)',
  borderWidth: '1px',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  padding: '1rem',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  outline: 'none',
  ...extra,
}))

export const menuItem = memo((destructive: boolean) => ({
  position: 'relative',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  cursor: 'default',
  userSelect: 'none',
  borderRadius: 'calc(var(--radius) - 4px)',
  padding: '0.375rem 0.5rem',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  outline: 'none',
  textAlign: 'left',
  transitionProperty: 'color, background-color',
  transitionDuration: '150ms',
  color: destructive ? 'var(--destructive)' : undefined,
  '&:hover, &:focus-visible': {
    background: 'var(--accent)',
    color: destructive ? 'var(--destructive)' : 'var(--accent-foreground)',
  },
  '& svg': { marginRight: '0.5rem' },
}))
export const menuSeparator = css({
  margin: '0.25rem -0.25rem',
  height: '1px',
  background: 'var(--muted)',
})

const checkSvg = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='hsl(210 40% 98%)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>",
)

export const checkbox = css({
  appearance: 'none',
  flexShrink: 0,
  width: '1rem',
  height: '1rem',
  borderRadius: 'calc(var(--radius) - 4px)',
  border: '1px solid var(--primary)',
  cursor: 'pointer',
  '&:focus-visible': focusRing,
  '&:checked': {
    background: `var(--primary) url("data:image/svg+xml,${checkSvg}") center / 100% no-repeat`,
  },
})

export const radio = css({
  appearance: 'none',
  flexShrink: 0,
  aspectRatio: '1',
  width: '1rem',
  height: '1rem',
  borderRadius: '9999px',
  border: '1px solid var(--primary)',
  cursor: 'pointer',
  '&:focus-visible': focusRing,
  '&:checked': {
    background: 'radial-gradient(circle, var(--primary) 0 0.3125rem, transparent 0.34rem)',
  },
})

export const skeleton = memo((extra?: CSSProps) => ({
  animation: 'groceries-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  borderRadius: 'calc(var(--radius) - 2px)',
  background: 'var(--muted)',
  ...extra,
}))
