// Tal vises som i danske matematikbøger: decimalkomma og rigtigt minustegn.

export function fmtNum(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (r === 0) return '0';
  return (r < 0 ? '−' : '') + String(Math.abs(r)).replace('.', ',');
}

export function fmtLinear(a: number, b: number): string {
  if (a === 0) return 'y = ' + fmtNum(b);
  let s = 'y = ' + (a === 1 ? '' : a === -1 ? '−' : fmtNum(a)) + 'x';
  if (b > 0) s += ' + ' + fmtNum(b);
  else if (b < 0) s += ' − ' + fmtNum(-b);
  return s;
}

// Med decimalkomma adskilles koordinater med semikolon: (2,5; 4)
export function fmtPoint(x: number, y: number): string {
  const sep = Number.isInteger(x) && Number.isInteger(y) ? ', ' : '; ';
  return `(${fmtNum(x)}${sep}${fmtNum(y)})`;
}
