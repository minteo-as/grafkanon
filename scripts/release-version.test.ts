import { describe, expect, it } from 'vitest'
import { checkRelease, highestVersion, parseVersion } from './release-version'

describe('versionsnumre ved release', () => {
  it.each(['v0.1.1', 'v0.2.0', 'v1.0.0'])('0.1.0 -> %s er lovlig', (tag) => {
    expect(checkRelease(tag, '0.1.0')).toBeNull()
  })

  it.each(['v0.1.0', 'v0.1.2', 'v0.3.0', 'v0.2.1', 'v2.0.0', 'v1.0.1', 'v1.1.0', 'v0.0.9'])(
    '0.1.0 -> %s afvises',
    (tag) => {
      expect(checkRelease(tag, '0.1.0')).toMatch(/følger ikke efter 0\.1\.0/)
    },
  )

  it('fortæller hvilke versioner der er lovlige', () => {
    expect(checkRelease('v0.5.0', '0.1.0')).toContain('v0.1.1, v0.2.0, v1.0.0')
  })

  it.each(['0.2.0', 'v0.2', 'v0.2.0-beta', 'v01.2.0', 'version1'])('tagget "%s" har forkert form', (tag) => {
    expect(checkRelease(tag, '0.1.0')).toMatch(/formen vX\.Y\.Z/)
  })

  it('finder højeste version blandt tags (numerisk, ikke alfabetisk)', () => {
    expect(highestVersion(['v0.9.0', 'v0.10.0', 'v0.2.3', 'ikke-et-tag'])).toEqual([0, 10, 0])
    expect(highestVersion([])).toBeNull()
  })

  it('læser versioner med og uden v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })
})
