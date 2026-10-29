import type { Help } from '../game/scoring';
import { fmtLinear, fmtNum } from '../math/format';
import type { Line, Segment } from '../math/line';
import { parseLinear, type ParseResult } from '../math/parse';

export interface ControlsCallbacks {
  onLine(line: Line): void;
  onFire(): void;
  onHelp(help: Help): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const PARSE_ERRORS: Record<Exclude<ParseResult, { ok: true }>['reason'], string> = {
  empty: 'Skriv en forskrift, fx y = 2x + 3',
  vertical: 'x = … er en lodret linje. Laseren skal bruge y = ax + b.',
  notLinear: 'Laseren kan kun skyde langs rette linjer.',
  unreadable: 'Det kan jeg ikke læse. Skriv fx y = 2x + 3',
};

const A_STEP = 0.5;
const B_STEP = 1;

export class Controls {
  private sliderA = $<HTMLInputElement>('sliderA');
  private sliderB = $<HTMLInputElement>('sliderB');
  private outA = $<HTMLOutputElement>('outA');
  private outB = $<HTMLOutputElement>('outB');
  private formula = $('formula');
  private warn = $('warn');
  private input = $<HTMLInputElement>('funcInput');
  private error = $('funcError');
  private fireButton = $<HTMLButtonElement>('fire');
  private aimToggle = $<HTMLInputElement>('helpAim');
  private coordsToggle = $<HTMLInputElement>('helpCoords');
  private current: Line = { a: 1, b: 0 };

  constructor(private cb: ControlsCallbacks) {
    const fromSliders = () => cb.onLine({ a: Number(this.sliderA.value), b: Number(this.sliderB.value) });
    this.sliderA.addEventListener('input', fromSliders);
    this.sliderB.addEventListener('input', fromSliders);

    $('funcForm').addEventListener('submit', ev => {
      ev.preventDefault();
      const r = parseLinear(this.input.value);
      if (!r.ok) {
        this.error.textContent = PARSE_ERRORS[r.reason];
        return;
      }
      if (Math.abs(r.a) > 20 || Math.abs(r.b) > 50) {
        this.error.textContent = 'Tallene er for store til banen.';
        return;
      }
      this.error.textContent = '';
      cb.onLine({ a: r.a, b: r.b });
    });
    this.input.addEventListener('input', () => (this.error.textContent = ''));

    this.fireButton.addEventListener('click', () => cb.onFire());
    const help = () => cb.onHelp({ aimLine: this.aimToggle.checked, coordinates: this.coordsToggle.checked });
    this.aimToggle.addEventListener('change', help);
    this.coordsToggle.addEventListener('change', help);

    document.addEventListener('keydown', ev => this.onKey(ev));
  }

  get help(): Help {
    return { aimLine: this.aimToggle.checked, coordinates: this.coordsToggle.checked };
  }

  showLine(line: Line, segment: Segment | null): void {
    this.current = { ...line };
    this.sliderA.value = String(line.a);
    this.sliderB.value = String(line.b);
    this.outA.textContent = fmtNum(line.a);
    this.outB.textContent = fmtNum(line.b);
    this.formula.textContent = fmtLinear(line.a, line.b);
    this.warn.textContent = segment ? '' : 'Linjen går uden for banen.';
  }

  setFireEnabled(enabled: boolean): void {
    this.fireButton.disabled = !enabled;
  }

  private onKey(ev: KeyboardEvent): void {
    const t = ev.target as HTMLElement | null;
    if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text') return;
    if (t?.tagName === 'TEXTAREA') return;
    const onSlider = t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range';

    // Pile flytter a og b. På en fokuseret skyder klarer browseren det selv.
    const step = (value: number, delta: number, size: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round((value + delta) / size) * size));
    const { a, b } = this.current;
    switch (ev.code) {
      case 'Space':
        if (t?.tagName === 'BUTTON') return;
        ev.preventDefault();
        this.cb.onFire();
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (onSlider) return;
        ev.preventDefault();
        this.cb.onLine({ a: step(a, ev.code === 'ArrowRight' ? A_STEP : -A_STEP, A_STEP, -4, 4), b });
        return;
      case 'ArrowUp':
      case 'ArrowDown':
        if (onSlider) return;
        ev.preventDefault();
        this.cb.onLine({ a, b: step(b, ev.code === 'ArrowUp' ? B_STEP : -B_STEP, B_STEP, -10, 10) });
        return;
    }
  }
}
