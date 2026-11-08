// Tal vises som i danske matematikbøger: decimalkomma og rigtigt minustegn.

export function fmtNum(n: number): string {
  const r = Math.round(n * 100) / 100
  if (r === 0) return '0'
  return (r < 0 ? '−' : '') + String(Math.abs(r)).replace('.', ',')
}

export function fmtLinear(a: number, b: number): string {
  if (a === 0) return 'y = ' + fmtNum(b)
  let s = 'y = ' + (a === 1 ? '' : a === -1 ? '−' : fmtNum(a)) + 'x'
  if (b > 0) s += ' + ' + fmtNum(b)
  else if (b < 0) s += ' − ' + fmtNum(-b)
  return s
}

// Med decimalkomma adskilles koordinater med semikolon: (2,5; 4)
export function fmtPoint(x: number, y: number): string {
  const sep = Number.isInteger(x) && Number.isInteger(y) ? ', ' : '; '
  return `(${fmtNum(x)}${sep}${fmtNum(y)})`
}

/** Toppunktsform: y = −0,5(x − 2)² + 8 */
export function fmtVertex(a: number, h: number, k: number): string {
  const coef = a === 1 ? '' : a === -1 ? '−' : fmtNum(a)
  const square = h === 0 ? 'x²' : `(x ${h > 0 ? '−' : '+'} ${fmtNum(Math.abs(h))})²`
  let s = `y = ${coef}${square}`
  if (k > 0) s += ' + ' + fmtNum(k)
  else if (k < 0) s += ' − ' + fmtNum(-k)
  return s
}

/** Almindelig form: y = −x² + 4x + 5 */
export function fmtGeneral(a: number, b: number, c: number): string {
  const coef = (v: number, first: boolean) => {
    const sign = v < 0 ? (first ? '−' : ' − ') : first ? '' : ' + '
    return { sign, abs: Math.abs(v) }
  }
  let s = 'y = '
  const ta = coef(a, true)
  s += ta.sign + (ta.abs === 1 ? '' : fmtNum(ta.abs)) + 'x²'
  if (b !== 0) {
    const tb = coef(b, false)
    s += tb.sign + (tb.abs === 1 ? '' : fmtNum(tb.abs)) + 'x'
  }
  if (c !== 0) {
    const tc = coef(c, false)
    s += tc.sign + fmtNum(tc.abs)
  }
  return s
}

/** Eksponentiel vækst: y = 5 · 1,2ˣ */
export function fmtExp(a: number, b: number): string {
  return `y = ${b === 1 ? '' : fmtNum(b) + ' · '}${fmtNum(a)}ˣ`
}

/** Hvad der sker for hvert skridt: "+20 % pr. skridt" (eksponentiel) eller "+2 pr. skridt" (lineær). */
export function fmtGrowth(aim: { kind: 'exp' | 'line'; a: number }): string {
  const change = aim.kind === 'exp' ? (aim.a - 1) * 100 : aim.a
  if (Math.abs(change) < 1e-9) return 'Uændret for hvert skridt'
  const sign = change > 0 ? '+' : '−'
  return `${sign}${fmtNum(Math.abs(change))}${aim.kind === 'exp' ? ' %' : ''} pr. skridt`
}
