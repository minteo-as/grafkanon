// Læser en lineær forskrift, som eleverne skriver den: "y = 0,5x − 2", "f(x) = 3 + 2x", "y = ½x", "y = x/2".

export type ParseResult =
  | { ok: true; a: number; b: number }
  | { ok: false; reason: 'empty' | 'vertical' | 'notLinear' | 'unreadable' };

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const X_TERM = new RegExp(`^(?:(${NUM})(?:/(${NUM}))?)?x(?:/(${NUM}))?$`);
const CONST_TERM = new RegExp(`^(${NUM})(?:/(${NUM}))?$`);

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.')
    .replace(/[·*]/g, '')
    .replace(/½/g, '0.5');
}

export function parseLinear(input: string): ParseResult {
  let s = normalize(input);
  if (!s) return { ok: false, reason: 'empty' };
  if (/^x=/.test(s)) return { ok: false, reason: 'vertical' };
  if (/x\^|x²|x³|xx/.test(s)) return { ok: false, reason: 'notLinear' };
  s = s.replace(/^(y|f\(x\))=/, '');
  if (!s || s.includes('=')) return { ok: false, reason: 'unreadable' };

  const terms = s.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== s) return { ok: false, reason: 'unreadable' };

  let a = 0;
  let b = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    if (body.includes('x')) {
      const m = body.match(X_TERM);
      if (!m) return { ok: false, reason: 'unreadable' };
      let c = m[1] ? Number(m[1]) : 1;
      if (m[2]) c /= Number(m[2]);
      if (m[3]) c /= Number(m[3]);
      a += sign * c;
    } else {
      const m = body.match(CONST_TERM);
      if (!m) return { ok: false, reason: 'unreadable' };
      let c = Number(m[1]);
      if (m[2]) c /= Number(m[2]);
      b += sign * c;
    }
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, reason: 'unreadable' };
  return { ok: true, a, b };
}
