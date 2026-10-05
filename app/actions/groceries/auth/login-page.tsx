import { css } from 'remix/component'
import type { Handle } from 'remix/component'

import { routes } from '../../../routes.ts'
import { APP_TITLE, GroceriesLayout } from '../layout.tsx'
import { PendingButton } from '../public/pending-button.tsx'
import { pageTitle } from '../public/ui/styles.ts'

export type LoginMode = 'signin' | 'register'

export interface LoginPageProps {
  mode: LoginMode
  email?: string
  error?: string
  returnTo?: string | null
}

const fieldInput = css({
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderWidth: '1px',
  borderRadius: 'calc(var(--radius) - 2px)',
  background: 'var(--background)',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
  '&:focus': { outline: 'none', boxShadow: '0 0 0 2px var(--ring)' },
})
const fieldLabel = css({ fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: 500 })
const field = css({ display: 'flex', flexDirection: 'column', gap: '0.5rem' })
const toggleLink = css({ color: 'var(--foreground)', textDecoration: 'underline' })

// LoginPage.tsx: one card that toggles between sign in and register. The toggle is a link
// (?mode=register) so it works before hydration.
export function LoginPage(handle: Handle<LoginPageProps>) {
  return () => {
    let { mode, email = '', error, returnTo } = handle.props
    let signin = mode === 'signin'
    let action = signin
      ? routes.groceries.auth.loginAction.href()
      : routes.groceries.auth.register.href()
    let toggle = new URLSearchParams({ mode: signin ? 'register' : 'signin' })
    if (returnTo) toggle.set('returnTo', returnTo)

    return (
      <GroceriesLayout user={null}>
        <div
          mix={css({
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <div
            mix={css({
              width: '100%',
              maxWidth: '24rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              padding: '1.5rem',
              borderWidth: '1px',
              borderRadius: 'var(--radius)',
              background: 'var(--card)',
            })}
          >
            <div>
              <h1 mix={pageTitle}>{APP_TITLE}</h1>
              <p
                mix={css({
                  fontSize: '0.875rem',
                  lineHeight: '1.25rem',
                  color: 'var(--muted-foreground)',
                  marginTop: '0.25rem',
                })}
              >
                {signin ? 'Sign in to your account' : 'Create a new account'}
              </p>
            </div>

            <form
              method="post"
              action={action}
              mix={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}
            >
              {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
              <div mix={field}>
                <label for="username" mix={fieldLabel}>
                  Email
                </label>
                <input
                  id="username"
                  name="email"
                  type="email"
                  autocomplete="username"
                  defaultValue={email}
                  required
                  autofocus
                  mix={fieldInput}
                />
              </div>
              <div mix={field}>
                <label for="password" mix={fieldLabel}>
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autocomplete={signin ? 'current-password' : 'new-password'}
                  required
                  mix={fieldInput}
                />
              </div>

              {error && (
                <p
                  role="alert"
                  mix={css({
                    fontSize: '0.875rem',
                    lineHeight: '1.25rem',
                    color: 'var(--destructive)',
                  })}
                >
                  {error}
                </p>
              )}

              <PendingButton
                pendingLabel={signin ? 'Signing in…' : 'Creating account…'}
                extra={{ width: '100%', height: 'auto', padding: '0.5rem 1rem' }}
              >
                {signin ? 'Sign In' : 'Register'}
              </PendingButton>
            </form>

            <p
              mix={css({
                fontSize: '0.875rem',
                lineHeight: '1.25rem',
                textAlign: 'center',
                color: 'var(--muted-foreground)',
              })}
            >
              {signin ? 'No account? ' : 'Already have an account? '}
              <a href={`${routes.groceries.auth.login.href()}?${toggle}`} mix={toggleLink}>
                {signin ? 'Register' : 'Sign In'}
              </a>
            </p>
          </div>
        </div>
      </GroceriesLayout>
    )
  }
}
