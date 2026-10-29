import { describe, expect, it } from 'vitest';
import { fmtLinear, fmtNum, fmtPoint } from './format';
import { clipToSquare, distanceToLine } from './line';
import { parseLinear } from './parse';

describe('fmtNum', () => {
  it('bruger decimalkomma og minustegn', () => {
    expect(fmtNum(0.5)).toBe('0,5');
    expect(fmtNum(-1.25)).toBe('−1,25');
    expect(fmtNum(-0)).toBe('0');
    expect(fmtNum(1 / 3)).toBe('0,33');
  });
});

describe('fmtLinear', () => {
  it.each([
    [1, 0, 'y = x'],
    [-1, 3, 'y = −x + 3'],
    [2, -5, 'y = 2x − 5'],
    [0.5, 0, 'y = 0,5x'],
    [0, -4, 'y = −4'],
    [0, 0, 'y = 0'],
  ])('a=%s b=%s → %s', (a, b, out) => {
    expect(fmtLinear(a, b)).toBe(out);
  });
});

describe('fmtPoint', () => {
  it('bruger semikolon ved decimaler', () => {
    expect(fmtPoint(-3, 5)).toBe('(−3, 5)');
    expect(fmtPoint(2.5, 4)).toBe('(2,5; 4)');
  });
});

describe('parseLinear', () => {
  it.each([
    ['y = 2x + 3', 2, 3],
    ['y=-0,5x+2', -0.5, 2],
    ['y = −x − 4', -1, -4],
    ['f(x) = 3 + 2x', 2, 3],
    ['2x', 2, 0],
    ['y = x', 1, 0],
    ['y = ½x - 1', 0.5, -1],
    ['y = 1/2x', 0.5, 0],
    ['y = x/2 + 1', 0.5, 1],
    ['y = 3/4x', 0.75, 0],
    ['y = 7', 0, 7],
    ['y = -3', 0, -3],
    ['y = 1,5 x', 1.5, 0],
    ['Y = 2X + 1', 2, 1],
  ])('%s', (input, a, b) => {
    expect(parseLinear(input)).toEqual({ ok: true, a, b });
  });

  it.each([
    ['', 'empty'],
    ['x = 3', 'vertical'],
    ['y = x^2', 'notLinear'],
    ['y = x²', 'notLinear'],
    ['y = 2(x + 1)', 'unreadable'],
    ['hej', 'unreadable'],
    ['y = 2x +', 'unreadable'],
    ['y = 1/0x', 'unreadable'],
  ])('afviser %s', (input, reason) => {
    expect(parseLinear(input)).toEqual({ ok: false, reason });
  });
});

describe('clipToSquare', () => {
  it('klipper en skrå linje til banen', () => {
    expect(clipToSquare({ a: 1, b: 0 }, 10)).toEqual({ xa: -10, xb: 10 });
    const s = clipToSquare({ a: 2, b: 0 }, 10)!;
    expect(s.xa).toBeCloseTo(-5);
    expect(s.xb).toBeCloseTo(5);
  });
  it('giver null uden for banen', () => {
    expect(clipToSquare({ a: 0, b: 11 }, 10)).toBeNull();
    expect(clipToSquare({ a: 1, b: 25 }, 10)).toBeNull();
  });
});

describe('distanceToLine', () => {
  it('måler vinkelret afstand', () => {
    expect(distanceToLine({ a: 0, b: 2 }, 5, 5)).toBe(3);
    expect(distanceToLine({ a: 1, b: 0 }, 1, 1)).toBe(0);
  });
});
