import type { Handle, RemixNode } from 'remix/component'
import { css } from 'remix/component'

import { routes } from '../routes.ts'
import { trackNumber, type Track } from '../tracks.ts'
import { Document } from './document.tsx'

// Page shell shared by every track. Tracks without content yet show a placeholder.
export function TrackPage(handle: Handle<{ track: Track; children?: RemixNode }>) {
  return () => {
    let { track, children } = handle.props

    return (
      <Document title={`${track.title} · Samhain`}>
        <main
          mix={css({
            '& *, & *::before, & *::after': { boxSizing: 'border-box' },
            minHeight: '100vh',
            padding: '48px 24px',
            background: 'radial-gradient(ellipse at top, var(--surface-3), var(--surface-0) 70%)',
            fontSize: '15px',
            lineHeight: 1.5,
            display: 'flex',
            justifyContent: 'center',
          })}
        >
          <article
            mix={css({
              width: '100%',
              maxWidth: '560px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            })}
          >
            <a
              href={routes.home.href()}
              mix={css({
                alignSelf: 'flex-start',
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                transition: 'color 150ms ease',
                '&:hover, &:focus-visible': { color: 'var(--accent)', outline: 'none' },
              })}
            >
              &larr; Tracklist
            </a>
            <p
              mix={css({
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: 'var(--accent)',
              })}
            >
              Track {trackNumber(track)}
            </p>
            <h1
              mix={css({
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(32px, 8vw, 56px)',
                fontWeight: 700,
                lineHeight: 1.1,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
              })}
            >
              {track.title}
            </h1>
            {children ?? (
              <p mix={css({ margin: 0, color: 'var(--text-secondary)' })}>Nothing here yet.</p>
            )}
          </article>
        </main>
      </Document>
    )
  }
}
