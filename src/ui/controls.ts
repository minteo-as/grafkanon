import type { Help } from '../game/scoring';
import type { Weapon } from '../game/waves';
import { fmtLinear, fmtNum, fmtVertex } from '../math/format';
import { parseLinear, parseParabola, type ParabolaParseResult, type ParseResult } from '../math/parse';
import type { Aim, PathProblem } from '../math/path';

export interface ControlsCallbacks {
  onAim(aim: Aim): void;
  onFire(): void;
  onHelp(help: Help): void;
  onMenu(): void;
  onToggleSound(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

type Reason = Exclude<ParseResult, { ok: true }>['reason'] | Exclude<ParabolaParseResult, { ok: true }>['reason'];

const PARSE_ERRORS: Record<Weapon, Partial<Record<Reason, string>>> = {
  laser: {
    empty: 'Skriv en forskrift, fx y = 2x + 3',
    vertical: 'x = … er en lodret linje. Laseren skal bruge y = ax + b.',
    notLinear: 'Laseren kan kun skyde langs rette linjer.',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = 2x + 3',
  },
  grenade: {
    empty: 'Skriv en forskrift, fx y = −(x − 2)² + 9',
    notParabola: 'Granaten skal bruge en parabel med x². Skriv fx y = −(x − 2)² + 9',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = −0,5(x − 2)² + 8',
  },
};

const PATH_WARNINGS: Record<PathProblem, string> = {
  outside: 'Linjen går uden for banen.',
  opensUp: 'a skal være negativ, så buen vender nedad.',
  belowGround: 'Toppunktet skal ligge over jorden (k større end 0).',
  landsOutside: 'Buen lander uden for banen. Gør den smallere eller lavere.',
};

interface Param {
  key: 'a' | 'b' | 'h' | 'k';
  min: number;
  max: number;
  step: number;
  /** Taster, der mindsker og øger værdien. */
  keys: [string, string];
  shift?: boolean;
}

const PARAMS: Record<Weapon, Param[]> = {
  laser: [
    { key: 'a', min: -4, max: 4, step: 0.5, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'b', min: -10, max: 10, step: 1, keys: ['ArrowDown', 'ArrowUp'] },
  ],
  grenade: [
    { key: 'a', min: -3, max: -0.25, step: 0.25, keys: ['ArrowDown', 'ArrowUp'], shift: true },
    { key: 'h', min: -9, max: 9, step: 0.5, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'k', min: 0.5, max: 12, step: 0.5, keys: ['ArrowDown', 'ArrowUp'] },
  ],
};

const KEY_HINTS: Record<Weapon, string> = {
  laser: '<kbd>Mellemrum</kbd> skyder · <kbd>←</kbd><kbd>→</kbd> ændrer a · <kbd>↑</kbd><kbd>↓</kbd> ændrer b · <kbd>M</kbd> lyd · <kbd>Esc</kbd> menu',
  grenade:
    '<kbd>Mellemrum</kbd> skyder · <kbd>←</kbd><kbd>→</kbd> ændrer h · <kbd>↑</kbd><kbd>↓</kbd> ændrer k · <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd> ændrer a · <kbd>M</kbd> lyd · <kbd>Esc</kbd> menu',
};

const PLACEHOLDERS: Record<Weapon, string> = {
  laser: 'y = 0,5x − 2',
  grenade: 'y = −(x − 2)² + 9',
};

type Values = Record<Param['key'], number>;

const valuesOf = (aim: Aim): Values =>
  aim.kind === 'line' ? { a: aim.a, b: aim.b, h: 0, k: 0 } : { a: aim.a, b: 0, h: aim.h, k: aim.k };

const aimOf = (weapon: Weapon, v: Values): Aim =>
  weapon === 'laser' ? { kind: 'line', a: v.a, b: v.b } : { kind: 'parabola', a: v.a, h: v.h, k: v.k };

export const fmtAim = (aim: Aim): string => (aim.kind === 'line' ? fmtLinear(aim.a, aim.b) : fmtVertex(aim.a, aim.h, aim.k));

export class Controls {
  /** Slås fra, mens menuen er åben, så tasterne ikke styrer spillet bagved. */
  enabled = true;

  private sliders = $('sliders');
  private keysHint = $('keysHint');
  private formula = $('formula');
  private warn = $('warn');
  private input = $<HTMLInputElement>('funcInput');
  private error = $('funcError');
  private fireButton = $<HTMLButtonElement>('fire');
  private aimToggle = $<HTMLInputElement>('helpAim');
  private coordsToggle = $<HTMLInputElement>('helpCoords');
  private soundButton = $<HTMLButtonElement>('hudSound');
  private weapon: Weapon = 'laser';
  private locked: Partial<Values> = {};
  private rows = new Map<Param['key'], { input: HTMLInputElement; output: HTMLOutputElement }>();
  private current: Values = { a: 1, b: 0, h: 0, k: 0 };

  constructor(private cb: ControlsCallbacks) {
    $('funcForm').addEventListener('submit', ev => {
      ev.preventDefault();
      this.submitTyped();
    });
    this.input.addEventListener('input', () => (this.error.textContent = ''));

    this.fireButton.addEventListener('click', () => cb.onFire());
    const help = () => cb.onHelp({ aimLine: this.aimToggle.checked, coordinates: this.coordsToggle.checked });
    this.aimToggle.addEventListener('change', help);
    this.coordsToggle.addEventListener('change', help);
    $('hudMenu').addEventListener('click', () => cb.onMenu());
    this.soundButton.addEventListener('click', () => cb.onToggleSound());

    document.addEventListener('keydown', ev => this.onKey(ev));
    this.setWeapon('laser');
  }

  get help(): Help {
    return { aimLine: this.aimToggle.checked, coordinates: this.coordsToggle.checked };
  }

  /** Bygger skyderne til våbnet. Låste parametre vises, men kan ikke ændres. */
  setWeapon(weapon: Weapon, locked: Partial<Values> = {}): void {
    this.weapon = weapon;
    this.locked = locked;
    this.rows.clear();
    this.sliders.replaceChildren(
      ...PARAMS[weapon].map(p => {
        const row = document.createElement('div');
        row.className = 'slider';
        const id = `slider-${p.key}`;
        row.innerHTML = `<label for="${id}">${p.key}</label><input type="range" id="${id}"><output for="${id}"></output>`;
        const input = row.querySelector('input')!;
        Object.assign(input, { min: String(p.min), max: String(p.max), step: String(p.step) });
        const lockedValue = locked[p.key];
        if (lockedValue !== undefined) {
          input.disabled = true;
          row.classList.add('locked');
          row.title = `${p.key} står fast på ${fmtNum(lockedValue)} i denne bane`;
        }
        input.addEventListener('input', () => this.emit({ ...this.current, [p.key]: Number(input.value) }));
        this.rows.set(p.key, { input, output: row.querySelector('output')! });
        return row;
      }),
    );
    this.keysHint.innerHTML = KEY_HINTS[weapon];
    this.input.placeholder = PLACEHOLDERS[weapon];
    this.input.value = '';
    this.error.textContent = '';
  }

  showAim(aim: Aim, problem: PathProblem | null): void {
    this.current = valuesOf(aim);
    for (const [key, row] of this.rows) {
      row.input.value = String(this.current[key]);
      row.output.textContent = fmtNum(this.current[key]);
    }
    this.formula.textContent = fmtAim(aim);
    this.warn.textContent = problem ? PATH_WARNINGS[problem] : '';
  }

  setFireEnabled(enabled: boolean): void {
    this.fireButton.disabled = !enabled;
  }

  setMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? 'Lyd fra' : 'Lyd til';
    this.soundButton.setAttribute('aria-pressed', String(!muted));
  }

  private emit(values: Values): void {
    this.cb.onAim(aimOf(this.weapon, { ...values, ...this.locked }));
  }

  private submitTyped(): void {
    const errors = PARSE_ERRORS[this.weapon];
    let values: Values;
    if (this.weapon === 'laser') {
      const r = parseLinear(this.input.value);
      if (!r.ok) return void (this.error.textContent = errors[r.reason] ?? '');
      if (Math.abs(r.a) > 20 || Math.abs(r.b) > 50) return void (this.error.textContent = 'Tallene er for store til banen.');
      values = { a: r.a, b: r.b, h: 0, k: 0 };
    } else {
      const r = parseParabola(this.input.value);
      if (!r.ok) return void (this.error.textContent = errors[r.reason] ?? '');
      if (this.locked.a !== undefined && Math.abs(r.a - this.locked.a) > 1e-9) {
        return void (this.error.textContent = `I denne bane står a fast på ${fmtNum(this.locked.a)}. Skriv fx y = −(x − 2)² + 9`);
      }
      if (Math.abs(r.h) > 50 || Math.abs(r.k) > 50) return void (this.error.textContent = 'Tallene er for store til banen.');
      values = { a: r.a, b: 0, h: r.h, k: r.k };
    }
    this.error.textContent = '';
    this.emit(values);
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.enabled) return;
    const t = ev.target as HTMLElement | null;
    const typing = (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text') || t?.tagName === 'TEXTAREA';
    if (ev.code === 'Escape') {
      ev.preventDefault();
      if (typing) t?.blur();
      else this.cb.onMenu();
      return;
    }
    if (typing) return;
    if (ev.code === 'Space') {
      if (t?.tagName === 'BUTTON') return;
      ev.preventDefault();
      this.cb.onFire();
      return;
    }
    if (ev.code === 'KeyM') {
      this.cb.onToggleSound();
      return;
    }

    // Pile flytter parametrene. På en fokuseret skyder klarer browseren det selv.
    if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range') return;
    const param = PARAMS[this.weapon].find(p => p.keys.includes(ev.code) && !!p.shift === ev.shiftKey && this.locked[p.key] === undefined);
    if (!param) return;
    ev.preventDefault();
    const dir = ev.code === param.keys[1] ? 1 : -1;
    const next = Math.round((this.current[param.key] + dir * param.step) / param.step) * param.step;
    this.emit({ ...this.current, [param.key]: Math.min(param.max, Math.max(param.min, next)) });
  }
}
