import { css } from 'remix/component'

import { routes } from '../routes.ts'

interface Project {
  name: string
  description: string
  href: string
}

const projects: Project[] = [
  {
    name: '5 Minute Groceries',
    description: 'Plan meals, merge their ingredients into one list, and send it to a Kroger cart.',
    href: routes.groceries.meals.index.href(),
  },
]

// The Projects track: one row per project, styled like the home page tracklist.
export function ProjectList() {
  return () => (
    <ul
      aria-label="Projects"
      mix={css({
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      })}
    >
      {projects.map((project) => (
        <li key={project.href}>
          <a
            href={project.href}
            mix={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '16px 20px',
              background: 'var(--surface-3)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              transition: 'border-color 150ms ease, color 150ms ease',
              '&:hover, &:focus-visible': {
                borderColor: 'var(--accent)',
                color: 'var(--accent)',
                outline: 'none',
              },
            })}
          >
            <span
              mix={css({
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              })}
            >
              {project.name}
            </span>
            <span mix={css({ fontSize: '14px', color: 'var(--text-secondary)' })}>
              {project.description}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
