/**
 * Regler for versionsnumre ved release.
 *
 * En ny version skal følge logisk efter den forrige – præcis ét trin op:
 *   0.1.0 -> 0.1.1  (patch: rettelser)
 *   0.1.0 -> 0.2.0  (minor: nye niveauer/emner)
 *   0.1.0 -> 1.0.0  (major: fx ændringer der gør gemte stjerner ugyldige)
 *
 * Bruges af .github/workflows/release.yml:
 *   tsx scripts/release-version.ts check <nyt tag> <forrige version>
 *   tsx scripts/release-version.ts highest <tag> <tag> ...   (udskriver højeste version, eller intet)
 */
import { fileURLToPath } from 'node:url'

export type Version = [number, number, number]

export function parseVersion(text: string): Version | null {
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function formatVersion([a, b, c]: Version): string {
  return `${a}.${b}.${c}`
}

/** De tre lovlige næste versioner. */
export function nextVersions([major, minor, patch]: Version): Version[] {
  return [
    [major, minor, patch + 1],
    [major, minor + 1, 0],
    [major + 1, 0, 0],
  ]
}

/** Højeste version blandt en liste af tags/versioner (ugyldige ignoreres). */
export function highestVersion(texts: string[]): Version | null {
  const versions = texts.map(parseVersion).filter((v): v is Version => v !== null)
  versions.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])
  return versions.at(-1) ?? null
}

/** Returnerer en fejlbesked, eller null hvis `tag` er en lovlig næste version efter `previous`. */
export function checkRelease(tag: string, previous: string): string | null {
  if (!/^v/.test(tag) || !parseVersion(tag)) {
    return `Tagget "${tag}" skal have formen vX.Y.Z, fx v0.2.0.`
  }
  const prev = parseVersion(previous)
  if (!prev) return `Den forrige version "${previous}" kan ikke læses.`
  const next = parseVersion(tag)!
  const allowed = nextVersions(prev)
  if (allowed.some((v) => formatVersion(v) === formatVersion(next))) return null
  return (
    `Version ${formatVersion(next)} følger ikke efter ${formatVersion(prev)}. ` +
    `Vælg en af: ${allowed.map((v) => `v${formatVersion(v)}`).join(', ')}.`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'check') {
    const [tag, previous] = args
    const error = checkRelease(tag ?? '', previous ?? '')
    if (error) {
      console.error(error)
      process.exit(1)
    }
    console.log(`${tag} følger korrekt efter ${previous}.`)
  } else if (command === 'highest') {
    const highest = highestVersion(args)
    if (highest) console.log(formatVersion(highest))
  } else {
    console.error('Brug: release-version.ts check <tag> <forrige> | highest <tags...>')
    process.exit(2)
  }
}
