import { css } from 'remix/component'

import { Document } from './document.tsx'

export function HomePage() {
  return () => (
    <Document>
      <main
        mix={css({
          '& *, & *::before, & *::after': { boxSizing: 'border-box' },
          margin: 0,
          padding: '48px 24px',
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at top, var(--surface-3), var(--surface-0) 70%)',
          color: 'var(--text-primary)',
          fontSize: '15px',
          lineHeight: 1.5,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <div
          mix={css({
            width: '100%',
            maxWidth: '820px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '72px',
          })}
        >
          <Masthead />
          <Tracklist />
          <Footer />
        </div>
      </main>
    </Document>
  )
}

function Masthead() {
  return () => (
    <section
      aria-label="Welcome"
      mix={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '36px',
        width: '100%',
      })}
    >
      <p
        mix={css({
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '14px',
          lineHeight: 1.33,
          textTransform: 'uppercase',
          letterSpacing: '0.3em',
          color: 'var(--accent)',
          textAlign: 'center',
        })}
      >
        Welcome to
      </p>
      <SamhainWordmarkHero />
    </section>
  )
}

// Track titles for the album-back tracklist; durations are decorative.
const TRACKS = [
  { title: 'About', length: '4:12' },
  { title: 'Blog', length: '7:31' },
  { title: 'Projects', length: '10:06' },
]

function Tracklist() {
  return () => (
    <section
      aria-label="Tracklist"
      mix={css({
        width: '100%',
        maxWidth: '560px',
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        '@media (max-width: 720px)': { padding: '24px 16px' },
      })}
    >
      <h2
        mix={css({
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '13px',
          fontWeight: 700,
          lineHeight: 1.5,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'var(--accent)',
        })}
      >
        Side A
      </h2>
      <ol
        mix={css({
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        })}
      >
        {TRACKS.map((track, index) => (
          <li
            key={track.title}
            mix={css({
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
              fontSize: '16px',
              lineHeight: 1.5,
            })}
          >
            <span
              mix={css({
                flex: '0 0 28px',
                fontFamily: 'var(--font-display)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'var(--accent)',
              })}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{track.title}</span>
            <span
              aria-hidden="true"
              mix={css({
                flex: '1 1 auto',
                borderBottom: '2px dotted var(--border)',
                transform: 'translateY(-4px)',
              })}
            />
            <span
              mix={css({
                color: 'var(--text-secondary)',
                fontVariantNumeric: 'tabular-nums',
              })}
            >
              {track.length}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Footer() {
  return () => (
    <footer
      mix={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontSize: '12px',
        lineHeight: 1,
        color: 'var(--text-tertiary)',
      })}
    >
      <span>Built with</span>
      <FooterWordmark />
    </footer>
  )
}

function FooterWordmark() {
  // Links to the Remix homepage; the paths use currentColor so hover can
  // brighten the mark to the accent color.
  return () => (
    <a
      href="https://remix.run"
      aria-label="Remix"
      mix={css({
        display: 'block',
        height: '8px',
        width: 'calc(8px * 163 / 16)',
        color: 'var(--text-tertiary)',
        transition: 'color 150ms ease',
        '&:hover, &:focus-visible': { color: 'var(--accent)', outline: 'none' },
        '& svg': { display: 'block', width: '100%', height: '100%' },
      })}
    >
      <svg viewBox="0 0 163 16" fill="currentColor" aria-hidden="true">
        <path d="M11.5566 11.5024C11.9535 11.5025 12.2424 11.8811 12.1396 12.2661L11.1846 15.8481H0.0673828L1.22656 11.5024H11.5566ZM30.1533 0.0180664V0.019043C34.3663 0.0191833 37.2765 1.9102 36.6543 4.24268L36.2324 5.82178C35.6099 8.15428 31.6907 10.0454 27.4775 10.0454H27.0469L35.8965 15.8481H21.6875L14.5332 10.3257C14.247 10.1423 13.9147 10.0454 13.5752 10.0454H1.61523L2.74219 5.8208H23.6904C24.4776 5.82071 25.2104 5.4677 25.3271 5.03174C25.4436 4.59555 24.8992 4.2417 24.1113 4.2417H3.16406L4.29102 0.0180664H30.1533Z" />
        <path d="M113.897 15.9271L118.132 0.124207H129.313L125.052 15.9271H113.897Z" />
        <path d="M71.7284 0.124207H107.931C112.785 0.124207 116.142 2.29324 115.419 4.9787L112.475 15.9271H101.32L102.844 10.2722L103.722 7.04445L104.057 5.805C104.264 5.00452 103.257 4.33316 101.785 4.33316H98.6089C98.5831 4.53973 98.5831 4.74631 98.5056 4.9787L95.5877 15.9271H84.4069L85.9304 10.2722L86.8083 7.04445L87.144 5.805C87.3506 5.00452 86.3436 4.33316 84.8717 4.33316H81.7731L78.6487 15.9271H67.4937L71.7284 0.124207Z" />
        <path d="M145.926 2.73926L149.765 0.219727H162.734L150.971 7.93848L158.611 15.8135H145.642L143.047 13.1387L138.971 15.8135H126.002L138.002 7.93848L130.513 0.219727H143.482L145.926 2.73926Z" />
        <path d="M70.4294 0.124146L69.319 4.33313H48.6296L48.2175 5.9054H48.2233L48.2224 5.90833H68.8796L67.7692 10.1427H47.0856L47.0603 10.2726C46.8284 11.0727 47.8351 11.7177 49.3063 11.7179H67.3308L66.194 15.9269H43.1608C38.3069 15.9267 34.95 13.7581 35.6726 11.0988L37.2995 4.97864C37.3359 4.84353 37.384 4.71053 37.4392 4.57825L37.4372 4.57922L38.6042 0.124146H70.4294Z" />
      </svg>
    </a>
  )
}

function SamhainWordmarkHero() {
  // Thorned stems echo the October Rust cover; "SAMHAIN" is set in the display
  // font, sheared to the same angle, and uses currentColor so it inherits
  // `--text-primary`.
  return () => (
    <svg
      role="img"
      aria-label="Samhain"
      viewBox="0 0 820 73"
      mix={css({
        width: '100%',
        height: 'auto',
        display: 'block',
        color: 'var(--text-primary)',
        overflow: 'visible',
      })}
    >
      <Thorns />
      <text
        x="112"
        y="72"
        textLength="700"
        lengthAdjust="spacingAndGlyphs"
        transform={HERO_SHEAR}
        fill="currentColor"
        mix={css({
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '102px',
        })}
      >
        SAMHAIN
      </text>
    </svg>
  )
}

// Shears the hero artwork to the slant of the stripes it replaced.
const HERO_SHEAR = 'matrix(1 0 -0.287 1 20.7 0)'

const STEM_WIDTH = 11
const STEMS: { x: number; thorns: { y: number; side: -1 | 1; size: number }[] }[] = [
  {
    x: 10,
    thorns: [
      { y: 4, side: 1, size: 12 },
      { y: 22, side: -1, size: 14 },
      { y: 42, side: 1, size: 13 },
      { y: 60, side: -1, size: 12 },
    ],
  },
  {
    x: 44,
    thorns: [
      { y: 12, side: -1, size: 12 },
      { y: 30, side: 1, size: 15 },
      { y: 52, side: -1, size: 13 },
    ],
  },
  {
    x: 78,
    thorns: [
      { y: 2, side: -1, size: 11 },
      { y: 20, side: 1, size: 13 },
      { y: 40, side: -1, size: 14 },
      { y: 60, side: 1, size: 11 },
    ],
  },
]

// A curved thorn growing from the stem's edge, its tip angled up and out.
function thornPath(stemX: number, y: number, side: -1 | 1, size: number) {
  let edge = side === 1 ? stemX + STEM_WIDTH : stemX
  let base = size * 0.75
  let tipX = edge + side * size
  let tipY = y - size * 0.45
  return [
    `M${edge} ${y}`,
    `Q${edge + side * size * 0.35} ${y + base * 0.2} ${tipX} ${tipY}`,
    `Q${edge + side * size * 0.3} ${y + base * 0.75} ${edge} ${y + base}`,
    'Z',
  ].join(' ')
}

function Thorns() {
  // Stems are shaded like the cover's lit cylinders: dark edges, pale ridge.
  return () => (
    <g transform={HERO_SHEAR} aria-hidden="true">
      <defs>
        <linearGradient id="thorn-stem" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#1a2410" />
          <stop offset="0.35" stop-color="#88a36f" />
          <stop offset="0.55" stop-color="#b5cd9a" />
          <stop offset="0.8" stop-color="#5f7446" />
          <stop offset="1" stop-color="#0e140a" />
        </linearGradient>
        <linearGradient id="thorn-spike" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#b5cd9a" />
          <stop offset="1" stop-color="#303d1d" />
        </linearGradient>
      </defs>
      {STEMS.map((stem) => (
        <g key={stem.x}>
          {stem.thorns.map((thorn) => (
            <path
              key={thorn.y}
              d={thornPath(stem.x, thorn.y, thorn.side, thorn.size)}
              fill="url(#thorn-spike)"
            />
          ))}
          <rect
            x={stem.x}
            y={-4}
            width={STEM_WIDTH}
            height={81}
            rx={STEM_WIDTH / 2}
            fill="url(#thorn-stem)"
          />
        </g>
      ))}
    </g>
  )
}
