// Læser forskrifter, som eleverne skriver dem.
// Lineære: "y = 0,5x − 2", "f(x) = 3 + 2x", "y = ½x", "y = x/2".
// Parabler: "y = −0,5(x − 2)² + 8", "y = -(x+3)^2 + 4", "y = −x² + 2x + 3".

export type ParseResult =
  | { ok: true; a: number; b: number }
  | { ok: false; reason: 'empty' | 'vertical' | 'notLinear' | 'unreadable' };

export type ParabolaParseResult =
  | { ok: true; a: number; h: number; k: number }
  | { ok: false; reason: 'empty' | 'notParabola' | 'unreadable' };

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const X_TERM = new RegExp(`^(?:(${NUM})(?:/(${NUM}))?)?x(?:/(${NUM}))?$`);
const CONST_TERM = new RegExp(`^(${NUM})(?:/(${NUM}))?$`);

const COEF = new RegExp(`^(?:(${NUM})(?:/(${NUM}))?)?$`);
const VERTEX = new RegExp(`^([+-]?[^(]*)\\(x([+-]${NUM})?\\)²(?:([+-]${NUM}))?$`);

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.')
    .replace(/[·*]/g, '')
    .replace(/\^2/g, '²')
    .replace(/½/g, '0.5')
    // "2x + −3" og "2x − −3" er også rigtige forskrifter
    .replace(/\+-|-\+/g, '-')
    .replace(/--/g, '+');
}

export function parseLinear(input: string): ParseResult {
  let s = normalize(input);
  if (!s) return { ok: false, reason: 'empty' };
  if (/^x=/.test(s)) return { ok: false, reason: 'vertical' };
  if (/x\^|x²|x³|xx|\)²/.test(s)) return { ok: false, reason: 'notLinear' };
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

/** Tal foran en parentes eller et x: "" → 1, "-" → −1, "0.5", "1/2". */
function coefficient(raw: string): number {
  const sign = raw.startsWith('-') ? -1 : 1;
  const m = raw.replace(/^[+-]/, '').match(COEF);
  if (!m) return NaN;
  let c = m[1] ? Number(m[1]) : 1;
  if (m[2]) c /= Number(m[2]);
  return sign * c;
}

export function parseParabola(input: string): ParabolaParseResult {
  let s = normalize(input);
  if (!s) return { ok: false, reason: 'empty' };
  s = s.replace(/^(y|f\(x\))=/, '');
  if (!s || s.includes('=')) return { ok: false, reason: 'unreadable' };

  // Toppunktsform a(x − h)² + k
  if (s.includes('(')) {
    const m = s.match(VERTEX);
    if (!m) return { ok: false, reason: 'unreadable' };
    const a = coefficient(m[1]);
    const h = m[2] ? -Number(m[2]) : 0;
    const k = m[3] ? Number(m[3]) : 0;
    if (!Number.isFinite(a) || a === 0) return { ok: false, reason: 'unreadable' };
    return { ok: true, a, h: h === 0 ? 0 : h, k };
  }

  // Almindelig form ax² + bx + c, omregnet til toppunktsform
  const terms = s.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== s) return { ok: false, reason: 'unreadable' };
  let a = 0;
  let b = 0;
  let c = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const body = term.replace(/^[+-]/, '');
    if (body.endsWith('x²')) a += sign * coefficient(body.slice(0, -2));
    else if (body.endsWith('x')) b += sign * coefficient(body.slice(0, -1));
    else {
      const m = body.match(CONST_TERM);
      if (!m) return { ok: false, reason: 'unreadable' };
      c += sign * (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]));
    }
  }
  if (![a, b, c].every(Number.isFinite)) return { ok: false, reason: 'unreadable' };
  if (a === 0) return { ok: false, reason: 'notParabola' };
  const h = -b / (2 * a);
  return { ok: true, a, h: h === 0 ? 0 : h, k: c - (b * b) / (4 * a) };
}
