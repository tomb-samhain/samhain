import { css } from 'remix/component'
import type { Handle } from 'remix/component'

import type { KrogerLocation, KrogerStatus } from '../../../data/groceries/kroger.ts'
import type { CurrentUser } from '../../../data/groceries/users.ts'
import { routes } from '../../../routes.ts'
import { GroceriesLayout } from '../layout.tsx'
import { PendingButton } from '../public/pending-button.tsx'
import {
  badge,
  card,
  cardContent,
  cardDescription,
  cardHeader,
  cardTitle,
  input,
  pageTitle,
  radio,
  textDestructive,
} from '../public/ui/styles.ts'
import { AuthBanner } from './public/auth-banner.tsx'

export interface SettingsPageProps {
  user: CurrentUser
  status: KrogerStatus
  authSuccess: boolean
  zip: string
  locations: KrogerLocation[]
  locationError?: string
  accountError?: string
}

const page = css({ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '42rem' })
const cards = css({ display: 'flex', flexDirection: 'column', gap: '1rem' })

// SettingsPage.tsx with LocationCard and AuthCard. Location search is a GET form and
// saving is a POST, so the page works without JavaScript.
export function SettingsPage(handle: Handle<SettingsPageProps>) {
  return () => {
    let { user, status, authSuccess, zip, locations, locationError, accountError } = handle.props
    return (
      <GroceriesLayout user={user} active="settings" title="Settings · 5 Minute Groceries">
        <div mix={page}>
          <h1 mix={pageTitle}>Settings</h1>
          {authSuccess && <AuthBanner />}
          <div mix={cards}>
            <LocationCard status={status} zip={zip} locations={locations} error={locationError} />
            <AccountCard status={status} error={accountError} />
          </div>
        </div>
      </GroceriesLayout>
    )
  }
}

function LocationCard(
  handle: Handle<{ status: KrogerStatus; zip: string; locations: KrogerLocation[]; error?: string }>,
) {
  return () => {
    let { status, zip, locations, error } = handle.props
    let selectedId = status.locationId
    return (
      <section mix={card} aria-labelledby="location-title">
        <div mix={cardHeader}>
          <h3 id="location-title" mix={cardTitle}>
            Store Location
          </h3>
          <p mix={cardDescription}>Find and select your nearest Kroger store.</p>
          {status.locationName && (
            <div mix={css({ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', fontSize: '0.875rem' })}>
              <span mix={css({ color: 'var(--muted-foreground)' })}>Current:</span>
              <span mix={badge('outline')}>{status.locationName}</span>
            </div>
          )}
        </div>
        <div mix={cardContent}>
          <form method="get" action={routes.groceries.settings.index.href()} mix={css({ display: 'flex', gap: '0.5rem' })}>
            <input
              name="zip"
              defaultValue={zip}
              placeholder="ZIP code"
              aria-label="ZIP code"
              inputmode="numeric"
              autocomplete="postal-code"
              required
              mix={input({ maxWidth: '160px' })}
            />
            <PendingButton variant="outline" spinner icon="search">
              Search
            </PendingButton>
          </form>
          {error && (
            <p role="alert" mix={textDestructive}>
              {error}
            </p>
          )}
          {locations.length > 0 && (
            <form
              method="post"
              action={routes.groceries.settings.location.href()}
              mix={css({ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' })}
            >
              <input type="hidden" name="zip" value={zip} />
              <div role="radiogroup" aria-label="Kroger stores" mix={css({ display: 'grid', gap: '0.25rem' })}>
                {locations.map((location) => (
                  <div key={location.locationId} mix={css({ display: 'flex', alignItems: 'center', gap: '0.5rem' })}>
                    <input
                      type="radio"
                      id={`loc-${location.locationId}`}
                      name="location"
                      value={`${location.locationId}|${location.name}`}
                      defaultChecked={location.locationId === selectedId}
                      required
                      mix={radio}
                    />
                    <label for={`loc-${location.locationId}`} mix={css({ cursor: 'pointer', fontSize: '0.875rem', lineHeight: 1 })}>
                      <span mix={css({ fontWeight: 500 })}>{location.name}</span>
                      <span mix={css({ color: 'var(--muted-foreground)', marginLeft: '0.5rem' })}>{location.address}</span>
                    </label>
                  </div>
                ))}
              </div>
              <PendingButton spinner>Save location</PendingButton>
            </form>
          )}
        </div>
      </section>
    )
  }
}

function AccountCard(handle: Handle<{ status: KrogerStatus; error?: string }>) {
  return () => {
    let { status, error } = handle.props
    let connected = status.hasToken
    return (
      <section mix={card} aria-labelledby="account-title">
        <div mix={cardHeader}>
          <h3 id="account-title" mix={cardTitle}>
            Kroger Account
          </h3>
          <p mix={cardDescription}>Connect your Kroger account to enable adding items to your cart.</p>
        </div>
        <div mix={cardContent}>
          <div mix={css({ display: 'flex', alignItems: 'center', gap: '0.75rem' })}>
            <span mix={css({ fontSize: '0.875rem', fontWeight: 500 })}>Status:</span>
            <span mix={badge(connected ? 'success' : 'secondary')}>{connected ? 'Connected' : 'Not connected'}</span>
          </div>
          {error && (
            <p role="alert" mix={textDestructive}>
              {error}
            </p>
          )}
          {/* A full document navigation: the response redirects to kroger.com. */}
          <form method="post" action={routes.groceries.kroger.connect.href()} data-rmx-document>
            <PendingButton variant={connected ? 'outline' : 'default'} spinner icon="external-link" extra={{ gap: '1rem' }}>
              {connected ? 'Reconnect with Kroger' : 'Connect with Kroger'}
            </PendingButton>
          </form>
        </div>
      </section>
    )
  }
}
