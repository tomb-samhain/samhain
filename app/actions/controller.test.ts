import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { router } from '../router.ts'
import { routes } from '../routes.ts'
import { trackNumber, tracklist } from '../tracks.ts'

describe('root controller', () => {
  it('GET / returns the home page', async () => {
    let response = await router.fetch(new URL(routes.home.href(), 'http://localhost'))

    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type') ?? '', /text\/html/)
    assert.match(await response.text(), /<html[\s>]/)
  })

  it('GET / links every track in the tracklist', async () => {
    let response = await router.fetch(new URL(routes.home.href(), 'http://localhost'))
    let body = await response.text()

    for (let track of tracklist) {
      assert.match(body, new RegExp(`href="${track.href}"`))
    }
  })

  for (let track of tracklist) {
    it(`GET ${track.href} renders the ${track.title} track page`, async () => {
      let response = await router.fetch(new URL(track.href, 'http://localhost'))
      let body = await response.text()

      assert.equal(response.status, 200)
      assert.match(response.headers.get('Content-Type') ?? '', /text\/html/)
      assert.match(body, new RegExp(`<title>${track.title} · Samhain</title>`))
      assert.match(body, new RegExp(`Track ${trackNumber(track)}`))
    })
  }
})
