import type { Game } from '../game/game'
import { fmtNum } from '../math/format'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export const fmtScore = (n: number): string => n.toLocaleString('da-DK')

export interface OverlayButton {
  label: string
  onClick: () => void
  primary?: boolean
}

export interface OverlayOptions {
  title: string
  text: string
  buttons: OverlayButton[]
  /** Antal stjerner, der tændes én ad gangen. */
  stars?: number
  onStar?: (i: number) => void
}

export class Hud {
  private level = $('hudLevel')
  private wave = $('hudWave')
  private ammo = $('hudAmmo')
  private score = $('hudScore')
  private mult = $('hudMult')
  private multNext = $('hudMultNext')
  private marchChip = $('hudMarch')
  private marchTime = $('hudMarchTime')
  private hintEl = $('hint')
  private toastEl = $('toast')
  private overlay = $('overlay')
  private overlayTitle = $('overlayTitle')
  private overlayText = $('overlayText')
  private overlayStars = $('overlayStars')
  private overlayButtons = $('overlayButtons')
  private toastTimer = 0
  private starTimers: number[] = []
  private shownMarch = ''

  get overlayVisible(): boolean {
    return !this.overlay.hidden
  }

  update(game: Game): void {
    this.level.textContent = game.level.name
    this.wave.textContent = `${game.waveNumber}/${game.waveCount}`
    const used = game.ammoTotal - game.ammo
    this.ammo.textContent = '●'.repeat(game.ammo) + '○'.repeat(used)
    this.ammo.setAttribute('aria-label', `${game.ammo} af ${game.ammoTotal} skud tilbage`)
    this.score.textContent = fmtScore(game.score)
    this.mult.textContent = '×' + fmtNum(game.multiplier)
    const next = game.nextMultiplier
    this.multNext.hidden = next === game.multiplier
    this.multNext.textContent = `×${fmtNum(next)} fra næste bølge`
    this.updateMarch(game)
  }

  /** Kaldes hver frame, så nedtællingen er rigtig. Rører kun DOM, når tallet ændrer sig. */
  updateMarch(game: Game): void {
    const t = game.timeToHop
    const text = t === null ? '' : String(Math.max(1, Math.ceil(t)))
    if (text === this.shownMarch) return
    this.shownMarch = text
    this.marchChip.hidden = t === null
    this.marchTime.textContent = text
  }

  hint(text: string): void {
    this.hintEl.textContent = text
  }

  toast(text: string): void {
    this.toastEl.textContent = text
    this.toastEl.classList.remove('show')
    void this.toastEl.offsetWidth // genstart animationen
    this.toastEl.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1500)
  }

  showOverlay(opts: OverlayOptions): void {
    this.starTimers.forEach(clearTimeout)
    this.starTimers = []
    this.overlayTitle.textContent = opts.title
    this.overlayText.textContent = opts.text

    this.overlayStars.hidden = opts.stars === undefined
    if (opts.stars !== undefined) {
      const stars = Array.from({ length: 3 }, () => {
        const s = document.createElement('span')
        s.textContent = '★'
        return s
      })
      this.overlayStars.replaceChildren(...stars)
      this.overlayStars.setAttribute('aria-label', `${opts.stars} af 3 stjerner`)
      for (let i = 0; i < opts.stars; i++) {
        this.starTimers.push(
          window.setTimeout(
            () => {
              stars[i].classList.add('lit')
              opts.onStar?.(i)
            },
            350 + i * 380,
          ),
        )
      }
    }

    this.overlayButtons.replaceChildren(
      ...opts.buttons.map((b) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = b.primary ? 'btn primary' : 'btn'
        el.textContent = b.label
        el.addEventListener('click', b.onClick)
        return el
      }),
    )
    this.overlay.hidden = false
    const first =
      this.overlayButtons.querySelector<HTMLButtonElement>('.primary') ?? this.overlayButtons.querySelector('button')
    first?.focus({ preventScroll: true })
  }

  hideOverlay(): void {
    this.starTimers.forEach(clearTimeout)
    this.overlay.hidden = true
  }
}
