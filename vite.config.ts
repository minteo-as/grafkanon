import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

/**
 * Versionen, der vises på siden.
 *  - Release-build (RELEASE_VERSION sat af release-workflowen): tagget, fx "0.3.0".
 *  - Ellers: seneste versions-tag + commit-id, fx "0.2.0+c344353". Er commit'en
 *    selv tagget, vises kun versionen. Uden tags bruges versionen i package.json.
 */
function appVersion(): string {
  const release = process.env.RELEASE_VERSION
  if (release) return release.replace(/^v/, '')
  const described = git("describe --tags --long --abbrev=7 --match 'v[0-9]*'") // fx v0.2.0-3-gc344353
  const m = /^v(.+)-(\d+)-g([0-9a-f]+)$/.exec(described)
  if (m) return m[2] === '0' ? m[1] : `${m[1]}+${m[3]}`
  const commit = git('rev-parse --short=7 HEAD')
  return commit ? `${pkg.version}+${commit}` : pkg.version
}

// base: './' gør, at det byggede spil kan ligge i en vilkårlig mappe på en statisk webserver.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  // three.js alene fylder ca. 550 kB
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
