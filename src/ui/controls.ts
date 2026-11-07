import type { Barrier } from '../game/game'
import type { Help } from '../game/scoring'
import type { Weapon } from '../game/waves'
import { fmtGeneral, fmtLinear, fmtNum, fmtVertex } from '../math/format'
import { parseBarrier, parseLinear, parseParabola } from '../math/parse'
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

/** Hvordan der sigtes: laserens linje, granaten i toppunktsform eller almindelig form, eller en barriere. */
type Mode = 'laser' | 'vertex' | 'general' | 'barrier'
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
}

const PATH_WARNINGS: Record<PathProblem, string> = {
  outside: 'Linjen går uden for banen.',
  opensUp: 'a skal være negativ, så buen vender nedad.',
  belowGround: 'Toppunktet skal ligge over jorden.',
  landsOutside: 'Buen lander uden for banen. Gør den smallere eller lavere.',
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
}

const KEY_HINTS: Record<Mode, string> = {
  laser: '<kbd>←</kbd><kbd>→</kbd> ændrer a · <kbd>↑</kbd><kbd>↓</kbd> ændrer b',
  vertex:
    '<kbd>←</kbd><kbd>→</kbd> ændrer h · <kbd>↑</kbd><kbd>↓</kbd> ændrer k · <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd> ændrer a',
  general:
    '<kbd>←</kbd><kbd>→</kbd> ændrer b · <kbd>↑</kbd><kbd>↓</kbd> ændrer c · <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd> ændrer a',
  barrier: '<kbd>X</kbd>/<kbd>Y</kbd> vælger retning · <kbd>↑</kbd><kbd>↓</kbd> ændrer k',
}

const PLACEHOLDERS: Record<Mode, string> = {
  laser: 'y = 0,5x − 2',
  vertex: 'y = −(x − 2)² + 9',
  general: 'y = −x² + 4x + 5',
  barrier: 'y = −3',
}

const tidy = (v: number) => Math.round(v * 1e9) / 1e9 || 0

const valuesOf = (aim: Aim): Values =>
  aim.kind === 'line'
    ? { a: aim.a, b: aim.b, c: 0, h: 0, k: 0 }
    : { a: aim.a, h: aim.h, k: aim.k, b: tidy(-2 * aim.a * aim.h), c: tidy(aim.a * aim.h * aim.h + aim.k) }

function aimOf(mode: Mode, v: Values): Aim {
  if (mode === 'laser') return { kind: 'line', a: v.a, b: v.b }
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
    this.aimMode = weapon === 'laser' ? 'laser' : (opts.form ?? 'vertex')
    this.locked = opts.locked ?? {}
    this.charges = 0
    this.tools.hidden = true
    this.buildMode(this.aimMode)
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
    this.current = valuesOf(aim)
    this.refreshRows()
    this.formula.textContent =
      aim.kind === 'line'
        ? fmtLinear(aim.a, aim.b)
        : this.mode === 'general'
          ? fmtGeneral(aim.a, this.current.b, this.current.c)
          : fmtVertex(aim.a, aim.h, aim.k)
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
    this.laserTab.setAttribute('aria-pressed', String(!barrier))
    this.barrierTab.setAttribute('aria-pressed', String(barrier))
    this.axisRow.hidden = !barrier
    this.fireButton.textContent = barrier ? 'SÆT BARRIERE' : 'SKYD'
    this.fireButton.classList.toggle('barrier', barrier)
    this.keysHint.innerHTML = `<kbd>Mellemrum</kbd> ${barrier ? 'sætter barrieren' : 'skyder'} · ${KEY_HINTS[mode]}${
      this.tools.hidden ? '' : ' · <kbd>B</kbd> skifter mellem laser og barriere'
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
    const next = Math.round((this.current[param.key] + dir * param.step) / param.step) * param.step
    this.emit({ ...this.current, [param.key]: Math.min(param.max, Math.max(param.min, next)) })
  }
}
