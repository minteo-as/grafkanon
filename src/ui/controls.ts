import type { Barrier } from '../game/game'
import type { Help } from '../game/scoring'
import type { Weapon } from '../game/waves'
import { fmtExp, fmtGeneral, fmtGrowth, fmtLinear, fmtNum, fmtVertex } from '../math/format'
import { parseBarrier, parseExp, parseLinear, parseParabola } from '../math/parse'
import type { Aim, PathProblem } from '../math/path'

export interface ControlsCallbacks {
  onAim(aim: Aim): void
  onFire(): void
  onHelp(help: Help): void
  onMenu(): void
  onToggleSound(): void
  /** Hvor barrieren vil komme til at stå, eller null når laseren er valgt. */
  onBarrierPreview(barrier: Pick<Barrier, 'axis' | 'k'> | null): void
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

/**
 * Hvordan der sigtes: laserens linje, granaten i toppunktsform eller almindelig form, en barriere,
 * eller raketten med eksponentiel (exp) eller lineær vækst (growthLine).
 */
type Mode = 'laser' | 'vertex' | 'general' | 'barrier' | 'exp' | 'growthLine'
const isGrowth = (mode: Mode) => mode === 'exp' || mode === 'growthLine'
type Key = 'a' | 'b' | 'c' | 'h' | 'k'
type Values = Record<Key, number>

const PARSE_ERRORS: Record<Mode, Record<string, string>> = {
  laser: {
    empty: 'Skriv en forskrift, fx y = 2x + 3',
    vertical: 'x = … er en lodret linje. Den kan bruges som barriere, men laseren skal bruge y = ax + b.',
    notLinear: 'Laseren kan kun skyde langs rette linjer.',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = 2x + 3',
  },
  vertex: {
    empty: 'Skriv en forskrift, fx y = −(x − 2)² + 9',
    notParabola: 'Granaten skal bruge en parabel med x². Skriv fx y = −(x − 2)² + 9',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = −0,5(x − 2)² + 8',
  },
  general: {
    empty: 'Skriv en forskrift, fx y = −x² + 4x + 5',
    notParabola: 'Granaten skal bruge en parabel med x². Skriv fx y = −x² + 4x + 5',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = −x² + 4x + 5',
  },
  barrier: {
    empty: 'Skriv x = k eller y = k, fx y = −3',
    unreadable: 'En barriere er en lodret (x = 3) eller vandret (y = −2) linje.',
  },
  exp: {
    empty: 'Skriv en forskrift, fx y = 5 · 1,2^x',
    notExp: 'Raketten skal bruge eksponentiel vækst med x oppe i potensen. Skriv fx y = 5 · 1,2^x',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = 5 · 1,2^x (husk gangetegnet)',
  },
  growthLine: {
    empty: 'Skriv en forskrift, fx y = 2x + 3 eller y = 5 · 1,2^x',
    unreadable: 'Det kan jeg ikke læse. Skriv fx y = 2x + 3 eller y = 5 · 1,2^x',
  },
}

const PATH_WARNINGS: Record<PathProblem, string> = {
  outside: 'Linjen går uden for banen.',
  opensUp: 'a skal være negativ, så buen vender nedad.',
  belowGround: 'Toppunktet skal ligge over jorden.',
  landsOutside: 'Buen lander uden for banen. Gør den smallere eller lavere.',
  startOutside: 'Raketten starter i y = b på y-aksen. b skal være mellem 0 og 12.',
  badFactor: 'Vækstfaktoren a skal være større end 0.',
}

interface Param {
  key: Key
  min: number
  max: number
  step: number
  /** Taster, der mindsker og øger værdien. */
  keys: [string, string]
  shift?: boolean
}

const PARAMS: Record<Mode, Param[]> = {
  laser: [
    { key: 'a', min: -4, max: 4, step: 0.5, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'b', min: -10, max: 10, step: 1, keys: ['ArrowDown', 'ArrowUp'] },
  ],
  vertex: [
    { key: 'a', min: -3, max: -0.25, step: 0.25, keys: ['ArrowDown', 'ArrowUp'], shift: true },
    { key: 'h', min: -9, max: 9, step: 0.5, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'k', min: 0.5, max: 12, step: 0.5, keys: ['ArrowDown', 'ArrowUp'] },
  ],
  general: [
    { key: 'a', min: -3, max: -0.25, step: 0.25, keys: ['ArrowDown', 'ArrowUp'], shift: true },
    { key: 'b', min: -16, max: 16, step: 0.5, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'c', min: -30, max: 12, step: 0.5, keys: ['ArrowDown', 'ArrowUp'] },
  ],
  barrier: [{ key: 'k', min: -9, max: 9, step: 1, keys: ['ArrowDown', 'ArrowUp'] }],
  exp: [
    { key: 'a', min: 0.5, max: 3, step: 0.05, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'b', min: 0.25, max: 12, step: 0.25, keys: ['ArrowDown', 'ArrowUp'] },
  ],
  growthLine: [
    { key: 'a', min: -3, max: 3, step: 0.25, keys: ['ArrowLeft', 'ArrowRight'] },
    { key: 'b', min: 0.25, max: 12, step: 0.25, keys: ['ArrowDown', 'ArrowUp'] },
  ],
}

const KEY_HINTS: Record<Mode, string> = {
  laser: '<kbd>←</kbd><kbd>→</kbd> ændrer a · <kbd>↑</kbd><kbd>↓</kbd> ændrer b',
  vertex:
    '<kbd>←</kbd><kbd>→</kbd> ændrer h · <kbd>↑</kbd><kbd>↓</kbd> ændrer k · <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd> ændrer a',
  general:
    '<kbd>←</kbd><kbd>→</kbd> ændrer b · <kbd>↑</kbd><kbd>↓</kbd> ændrer c · <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd> ændrer a',
  barrier: '<kbd>X</kbd>/<kbd>Y</kbd> vælger retning · <kbd>↑</kbd><kbd>↓</kbd> ændrer k',
  exp: '<kbd>←</kbd><kbd>→</kbd> ændrer a · <kbd>↑</kbd><kbd>↓</kbd> ændrer b',
  growthLine: '<kbd>←</kbd><kbd>→</kbd> ændrer a · <kbd>↑</kbd><kbd>↓</kbd> ændrer b',
}

const PLACEHOLDERS: Record<Mode, string> = {
  laser: 'y = 0,5x − 2',
  vertex: 'y = −(x − 2)² + 9',
  general: 'y = −x² + 4x + 5',
  barrier: 'y = −3',
  exp: 'y = 5 · 1,2^x',
  growthLine: 'y = 2x + 3',
}

const tidy = (v: number) => Math.round(v * 1e9) / 1e9 || 0

const valuesOf = (aim: Aim): Values =>
  aim.kind === 'parabola'
    ? { a: aim.a, h: aim.h, k: aim.k, b: tidy(-2 * aim.a * aim.h), c: tidy(aim.a * aim.h * aim.h + aim.k) }
    : { a: aim.a, b: aim.b, c: 0, h: 0, k: 0 }

const snap = (v: number, p: Param) => Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step))

function aimOf(mode: Mode, v: Values): Aim {
  if (mode === 'laser' || mode === 'growthLine') return { kind: 'line', a: v.a, b: v.b }
  if (mode === 'exp') return { kind: 'exp', a: v.a, b: v.b }
  if (mode === 'vertex') return { kind: 'parabola', a: v.a, h: v.h, k: v.k }
  // Almindelig form omregnes til toppunktsform: h = −b/(2a), k = c − b²/(4a)
  return { kind: 'parabola', a: v.a, h: tidy(-v.b / (2 * v.a)), k: tidy(v.c - (v.b * v.b) / (4 * v.a)) }
}

export class Controls {
  /** Slås fra, mens menuen er åben, så tasterne ikke styrer spillet bagved. */
  enabled = true

  private sliders = $('sliders')
  private keysHint = $('keysHint')
  private formula = $('formula')
  private warn = $('warn')
  private input = $<HTMLInputElement>('funcInput')
  private error = $('funcError')
  private fireButton = $<HTMLButtonElement>('fire')
  private aimToggle = $<HTMLInputElement>('helpAim')
  private coordsToggle = $<HTMLInputElement>('helpCoords')
  private soundButton = $<HTMLButtonElement>('hudSound')
  private tools = $('tools')
  private laserTab = $<HTMLButtonElement>('toolLaser')
  private barrierTab = $<HTMLButtonElement>('toolBarrier')
  private barrierCount = $('barrierCount')
  private axisRow = $('barrierAxis')
  private growthTools = $('growthTools')
  private growthNote = $('growthNote')
  private aimMode: Mode = 'laser'
  private mode: Mode = 'laser'
  private locked: Partial<Values> = {}
  private rows = new Map<Key, { input: HTMLInputElement; output: HTMLOutputElement }>()
  private current: Values = { a: 1, b: 0, c: 0, h: 0, k: 0 }
  private lastAim: Aim = { kind: 'line', a: 1, b: 0 }
  private lastProblem: PathProblem | null = null
  private barrier: Pick<Barrier, 'axis' | 'k'> = { axis: 'y', k: 0 }
  private charges = 0

  constructor(private cb: ControlsCallbacks) {
    $('funcForm').addEventListener('submit', (ev) => {
      ev.preventDefault()
      this.submitTyped()
    })
    this.input.addEventListener('input', () => (this.error.textContent = ''))

    this.fireButton.addEventListener('click', () => cb.onFire())
    const help = () => cb.onHelp({ aimLine: this.aimToggle.checked, coordinates: this.coordsToggle.checked })
    this.aimToggle.addEventListener('change', help)
    this.coordsToggle.addEventListener('change', help)
    $('hudMenu').addEventListener('click', () => cb.onMenu())
    this.soundButton.addEventListener('click', () => cb.onToggleSound())
    this.laserTab.addEventListener('click', () => this.selectTool('laser'))
    this.barrierTab.addEventListener('click', () => this.selectTool('barrier'))
    for (const button of this.axisRow.querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('click', () =>
        this.setBarrier({ ...this.barrier, axis: button.dataset.axis as 'x' | 'y' }),
      )
    }
    for (const button of this.growthTools.querySelectorAll<HTMLButtonElement>('button')) {
      button.addEventListener('click', () => this.selectGrowth(button.dataset.growth === 'line' ? 'growthLine' : 'exp'))
    }

    document.addEventListener('keydown', (ev) => this.onKey(ev))
    this.setWeapon('laser')
  }

  get help(): Help {
    return { aimLine: this.aimToggle.checked, coordinates: this.coordsToggle.checked }
  }

  /** Er barrieren valgt i stedet for laseren? */
  get tool(): 'aim' | 'barrier' {
    return this.mode === 'barrier' ? 'barrier' : 'aim'
  }

  get barrierAim(): Pick<Barrier, 'axis' | 'k'> {
    return { ...this.barrier }
  }

  /** Sætter våbnet for banen. Låste parametre vises, men kan ikke ændres. */
  setWeapon(weapon: Weapon, opts: { locked?: Partial<Values>; form?: 'vertex' | 'general' } = {}): void {
    this.aimMode = weapon === 'laser' ? 'laser' : weapon === 'rocket' ? 'exp' : (opts.form ?? 'vertex')
    this.locked = opts.locked ?? {}
    this.charges = 0
    this.tools.hidden = true
    this.growthTools.hidden = true
    this.buildMode(this.aimMode)
  }

  /** Viser fanerne for eksponentiel og lineær vækst, når bølgen tillader lineær vækst. */
  setLinearAvailable(available: boolean): void {
    const show = available && isGrowth(this.aimMode)
    if (this.growthTools.hidden !== show) return
    this.growthTools.hidden = !show
    if (!show && this.aimMode === 'growthLine') this.selectGrowth('exp')
    else this.buildMode(this.mode)
  }

  /** Viser fanen med barrierer, når bølgen har nogen, og hvor mange der er tilbage. */
  setBarrierCharges(charges: number, available: boolean): void {
    const changed = this.tools.hidden === available
    this.charges = charges
    this.tools.hidden = !available
    this.barrierCount.textContent = String(charges)
    this.barrierTab.disabled = charges <= 0
    if (this.mode === 'barrier' && charges <= 0) this.selectTool('laser')
    else if (changed) this.buildMode(this.mode)
  }

  showAim(aim: Aim, problem: PathProblem | null): void {
    this.lastAim = aim
    this.lastProblem = problem
    if (this.mode === 'barrier') return
    // Raketten skifter selv mellem eksponentiel og lineær, fx når man skriver en forskrift
    if (isGrowth(this.mode)) {
      const wanted: Mode = aim.kind === 'line' ? 'growthLine' : 'exp'
      if (wanted !== this.mode) {
        this.aimMode = wanted
        return this.buildMode(wanted)
      }
    }
    this.current = valuesOf(aim)
    this.refreshRows()
    this.formula.textContent =
      aim.kind === 'line'
        ? fmtLinear(aim.a, aim.b)
        : aim.kind === 'exp'
          ? fmtExp(aim.a, aim.b)
          : this.mode === 'general'
            ? fmtGeneral(aim.a, this.current.b, this.current.c)
            : fmtVertex(aim.a, aim.h, aim.k)
    this.growthNote.textContent = aim.kind !== 'parabola' && isGrowth(this.mode) ? fmtGrowth(aim) : ''
    this.warn.textContent = problem ? PATH_WARNINGS[problem] : ''
  }

  setFireEnabled(enabled: boolean): void {
    this.fireButton.disabled = !enabled
  }

  setMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? 'Lyd fra' : 'Lyd til'
    this.soundButton.setAttribute('aria-pressed', String(!muted))
  }

  private selectTool(tool: 'laser' | 'barrier'): void {
    if (tool === 'barrier' && this.charges <= 0) return
    this.buildMode(tool === 'barrier' ? 'barrier' : this.aimMode)
  }

  /**
   * Skifter mellem eksponentiel og lineær vækst. Startværdien og første skridt beholdes,
   * så man kan se, hvordan de to slags vækst skilles ad bagefter.
   */
  private selectGrowth(target: 'exp' | 'growthLine'): void {
    if (target === this.mode || (target === 'growthLine' && this.growthTools.hidden)) return
    const { a, b } = this.current
    const firstStep = this.mode === 'exp' ? b * (a - 1) : this.mode === 'growthLine' ? a : 1
    const [pa] = PARAMS[target]
    const nextA = tidy(target === 'exp' ? snap(1 + firstStep / b, pa) : snap(firstStep, pa))
    this.aimMode = target
    this.lastAim = aimOf(target, { ...this.current, ...this.locked, a: nextA, b })
    this.buildMode(target)
    this.cb.onAim(this.lastAim)
  }

  private buildMode(mode: Mode): void {
    this.mode = mode
    this.rows.clear()
    this.sliders.replaceChildren(
      ...PARAMS[mode].map((p) => {
        const row = document.createElement('div')
        row.className = 'slider'
        const id = `slider-${p.key}`
        row.innerHTML = `<label for="${id}">${p.key}</label><input type="range" id="${id}"><output for="${id}"></output>`
        const input = row.querySelector('input')!
        Object.assign(input, { min: String(p.min), max: String(p.max), step: String(p.step) })
        const lockedValue = this.locked[p.key]
        if (lockedValue !== undefined && mode !== 'barrier') {
          input.disabled = true
          row.classList.add('locked')
          row.title = `${p.key} står fast på ${fmtNum(lockedValue)} i denne bane`
        }
        input.addEventListener('input', () => {
          if (this.mode === 'barrier') this.setBarrier({ ...this.barrier, k: Number(input.value) })
          else this.emit({ ...this.current, [p.key]: Number(input.value) })
        })
        this.rows.set(p.key, { input, output: row.querySelector('output')! })
        return row
      }),
    )
    const barrier = mode === 'barrier'
    for (const button of this.growthTools.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String((button.dataset.growth === 'line') === (mode === 'growthLine')))
    }
    this.growthNote.textContent = ''
    this.laserTab.setAttribute('aria-pressed', String(!barrier))
    this.barrierTab.setAttribute('aria-pressed', String(barrier))
    this.axisRow.hidden = !barrier
    this.fireButton.textContent = barrier ? 'SÆT BARRIERE' : 'SKYD'
    this.fireButton.classList.toggle('barrier', barrier)
    this.keysHint.innerHTML = `<kbd>Mellemrum</kbd> ${barrier ? 'sætter barrieren' : 'skyder'} · ${KEY_HINTS[mode]}${
      this.tools.hidden ? '' : ' · <kbd>B</kbd> skifter mellem laser og barriere'
    }${
      this.growthTools.hidden ? '' : ' · <kbd>L</kbd> skifter mellem eksponentiel og lineær'
    } · <kbd>M</kbd> lyd · <kbd>Esc</kbd> menu`
    this.input.placeholder = PLACEHOLDERS[mode]
    this.input.value = ''
    this.error.textContent = ''
    if (barrier) this.setBarrier(this.barrier)
    else {
      this.cb.onBarrierPreview(null)
      this.showAim(this.lastAim, this.lastProblem)
    }
  }

  private setBarrier(barrier: Pick<Barrier, 'axis' | 'k'>): void {
    this.barrier = { axis: barrier.axis, k: Math.max(-9, Math.min(9, Math.round(barrier.k))) }
    this.current = { ...this.current, k: this.barrier.k }
    this.refreshRows()
    for (const button of this.axisRow.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.axis === this.barrier.axis))
    }
    this.formula.textContent = `${this.barrier.axis} = ${fmtNum(this.barrier.k)}`
    this.warn.textContent =
      this.barrier.axis === 'x'
        ? 'Lodret: stopper dem, der går til siden.'
        : 'Vandret: stopper dem, der går op eller ned.'
    this.cb.onBarrierPreview(this.barrier)
  }

  private refreshRows(): void {
    for (const [key, row] of this.rows) {
      row.input.value = String(this.current[key])
      row.output.textContent = fmtNum(this.current[key])
    }
  }

  private emit(values: Values): void {
    const v = { ...values, ...this.locked }
    this.cb.onAim(aimOf(this.mode, v))
  }

  private submitTyped(): void {
    const errors = PARSE_ERRORS[this.mode]
    const fail = (reason: string) => void (this.error.textContent = errors[reason] ?? errors.unreadable)
    const tooBig = () => void (this.error.textContent = 'Tallene er for store til banen.')
    if (this.mode === 'barrier') {
      const r = parseBarrier(this.input.value)
      if (!r.ok) return fail(r.reason)
      this.error.textContent = ''
      return this.setBarrier(r)
    }
    if (isGrowth(this.mode)) {
      const exp = parseExp(this.input.value)
      const line = exp.ok || this.growthTools.hidden ? null : parseLinear(this.input.value)
      if (line?.ok) {
        if (Math.abs(line.a) > 20 || Math.abs(line.b) > 50) return tooBig()
        this.error.textContent = ''
        return this.cb.onAim({ kind: 'line', a: line.a, b: line.b })
      }
      if (!exp.ok) return fail(exp.reason)
      if (exp.a > 20 || exp.b > 50) return tooBig()
      this.error.textContent = ''
      return this.cb.onAim({ kind: 'exp', a: exp.a, b: exp.b })
    }
    if (this.mode === 'laser') {
      const r = parseLinear(this.input.value)
      if (!r.ok) return fail(r.reason)
      if (Math.abs(r.a) > 20 || Math.abs(r.b) > 50) return tooBig()
      this.error.textContent = ''
      return this.cb.onAim({ kind: 'line', a: r.a, b: r.b })
    }
    const r = parseParabola(this.input.value)
    if (!r.ok) return fail(r.reason)
    if (this.locked.a !== undefined && Math.abs(r.a - this.locked.a) > 1e-9) {
      this.error.textContent = `I denne bane står a fast på ${fmtNum(this.locked.a)}. Skriv fx y = −(x − 2)² + 9`
      return
    }
    if (Math.abs(r.h) > 50 || Math.abs(r.k) > 50) return tooBig()
    this.error.textContent = ''
    this.cb.onAim({ kind: 'parabola', a: r.a, h: r.h, k: r.k })
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.enabled) return
    const t = ev.target as HTMLElement | null
    const typing = (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text') || t?.tagName === 'TEXTAREA'
    if (ev.code === 'Escape') {
      ev.preventDefault()
      if (typing) t?.blur()
      else this.cb.onMenu()
      return
    }
    if (typing) return
    if (ev.code === 'Space') {
      if (t?.tagName === 'BUTTON') return
      ev.preventDefault()
      this.cb.onFire()
      return
    }
    if (ev.code === 'KeyM') return this.cb.onToggleSound()
    if (ev.code === 'KeyB' && !this.tools.hidden) return this.selectTool(this.mode === 'barrier' ? 'laser' : 'barrier')
    if (ev.code === 'KeyL' && !this.growthTools.hidden) {
      return this.selectGrowth(this.mode === 'growthLine' ? 'exp' : 'growthLine')
    }
    if (this.mode === 'barrier' && (ev.code === 'KeyX' || ev.code === 'KeyY')) {
      return this.setBarrier({ ...this.barrier, axis: ev.code === 'KeyX' ? 'x' : 'y' })
    }

    // Pile flytter parametrene. På en fokuseret skyder klarer browseren det selv.
    if (t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range') return
    if (this.mode === 'barrier' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.code)) {
      ev.preventDefault()
      const dir = ev.code === 'ArrowRight' || ev.code === 'ArrowUp' ? 1 : -1
      return this.setBarrier({ ...this.barrier, k: this.barrier.k + dir })
    }
    const param = PARAMS[this.mode].find(
      (p) => p.keys.includes(ev.code) && !!p.shift === ev.shiftKey && this.locked[p.key] === undefined,
    )
    if (!param) return
    ev.preventDefault()
    const dir = ev.code === param.keys[1] ? 1 : -1
    this.emit({ ...this.current, [param.key]: tidy(snap(this.current[param.key] + dir * param.step, param)) })
  }
}
