import { routes } from './routes.ts'

export interface Track {
  number: number
  title: string
  // Decorative running time shown on the album-back tracklist.
  length: string
  href: string
}

// Tracklist order is page order; each track is a top-level page route.
export const tracks = {
  about: { number: 1, title: 'About', length: '4:12', href: routes.about.href() },
  blog: { number: 2, title: 'Blog', length: '7:31', href: routes.blog.href() },
  projects: { number: 3, title: 'Projects', length: '10:06', href: routes.projects.href() },
} satisfies Record<string, Track>

export const tracklist: Track[] = Object.values(tracks)

export function trackNumber(track: Track) {
  return String(track.number).padStart(2, '0')
}
