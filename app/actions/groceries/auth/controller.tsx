import { redirect } from 'remix/response/redirect'
import { createController } from 'remix/router'
import type { Session } from 'remix/session'

import { authenticateUser, registerUser } from '../../../data/groceries/users.ts'
import { AUTH_SESSION_KEY, safeReturnTo } from '../../../middleware/groceries-auth.ts'
import { routes } from '../../../routes.ts'
import { formText } from '../form.ts'
import { LoginPage, type LoginMode } from './login-page.tsx'

// Rotates the session id on sign in. Sessions live entirely in the signed cookie, so the
// old id disappears with the old cookie; remix/auth's completeAuth() would also try to
// delete it from storage and log a warning on every sign in.
function startSession(session: Session, userId: number) {
  session.regenerateId()
  session.set(AUTH_SESSION_KEY, { userId })
}

export default createController(routes.groceries.auth, {
  actions: {
    login(context) {
      let returnTo = safeReturnTo(context.url.searchParams.get('returnTo'))
      if (context.auth.ok) return redirect(returnTo ?? routes.groceries.meals.index.href(), 303)

      let mode: LoginMode =
        context.url.searchParams.get('mode') === 'register' ? 'register' : 'signin'
      return context.render(<LoginPage mode={mode} returnTo={returnTo} />)
    },

    async loginAction(context) {
      let email = formText(context.formData, 'email').trim()
      let password = formText(context.formData, 'password')
      let returnTo = safeReturnTo(context.formData.get('returnTo'))

      let user = email && password ? await authenticateUser(context.db, email, password) : null
      if (!user) {
        return context.render(
          <LoginPage mode="signin" email={email} error="Invalid credentials" returnTo={returnTo} />,
          { status: 400 },
        )
      }

      startSession(context.session, user.id)
      return redirect(returnTo ?? routes.groceries.meals.index.href(), 303)
    },

    async register(context) {
      let email = formText(context.formData, 'email').trim()
      let password = formText(context.formData, 'password')
      let returnTo = safeReturnTo(context.formData.get('returnTo'))

      let result = password
        ? await registerUser(context.db, email, password)
        : ({ ok: false, error: 'Password is required' } as const)
      if (!result.ok) {
        return context.render(
          <LoginPage mode="register" email={email} error={result.error} returnTo={returnTo} />,
          { status: 400 },
        )
      }

      startSession(context.session, result.user.id)
      return redirect(returnTo ?? routes.groceries.meals.index.href(), 303)
    },

    logout(context) {
      context.session.destroy()
      return redirect(routes.groceries.auth.login.href(), 303)
    },
  },
})
