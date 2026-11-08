import { daysUntilNext, type Challenge } from '../game/challenge'
import { LEVELS, WORLDS } from '../game/levels'
import type { Weapon } from '../game/waves'
import { bossRequirement, isUnlocked, worldStars, type Progress } from '../game/progress'
import { fmtScore } from './hud'

export interface MenuCallbacks {
  onPlay(levelIndex: number): void
  onChallenge(): void
  onTraining(weapon: Weapon): void
  onContinue(): void
  onToggleSound(): void
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export const starString = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n)

export class Menu {
  private root = $('menu')
  private list = $('worldList')
  private continueButton = $<HTMLButtonElement>('menuContinue')
  private soundButton = $<HTMLButtonElement>('menuSound')

  constructor(private cb: MenuCallbacks) {
    this.continueButton.addEventListener('click', () => cb.onContinue())
    this.soundButton.addEventListener('click', () => cb.onToggleSound())
  }

  get visible(): boolean {
    return !this.root.hidden
  }

  show(progress: Progress, challenge: Challenge, canContinue: boolean, muted: boolean): void {
    this.continueButton.hidden = !canContinue
    this.setMuted(muted)
    const levelItems = LEVELS.map((level, i) => {
      const li = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'level'
      const unlocked = isUnlocked(progress, i)
      const number = LEVELS.slice(0, i + 1).filter((l) => l.world === level.world).length
      const saved = progress.levels[level.id]
      button.disabled = !unlocked
      button.innerHTML = `
        <span class="level-num">${number}</span>
        <span class="level-text"><b></b><span></span></span>
        <span class="level-meta"></span>`
      button.querySelector('b')!.textContent = level.name
      button.querySelector('.level-text span')!.textContent = level.topic
      const meta = button.querySelector('.level-meta')!
      const prevDone = i === 0 || !!progress.levels[LEVELS[i - 1].id]
      if (!unlocked) meta.textContent = level.boss && prevDone ? `Kræver ${bossRequirement(level.world)} ★` : 'Låst'
      else if (saved) {
        meta.innerHTML = `<span class="stars" aria-label="${saved.stars} af 3 stjerner"></span><small></small>`
        meta.querySelector('.stars')!.textContent = starString(saved.stars)
        meta.querySelector('small')!.textContent = `${fmtScore(saved.best)} point`
      } else meta.textContent = 'Ny'
      button.addEventListener('click', () => this.cb.onPlay(i))
      li.append(button)
      return li
    })
    this.list.replaceChildren(
      this.challengeSection(progress, challenge),
      this.trainingSection(progress),
      ...WORLDS.map((world) => {
        const section = document.createElement('section')
        const title = document.createElement('h2')
        title.className = 'world-title'
        title.textContent = `Verden ${world.id} · ${world.name}`
        const { stars, max } = worldStars(progress, world.id)
        const total = document.createElement('span')
        total.className = 'world-stars'
        total.textContent = `★ ${stars}/${max}`
        title.append(total)
        const ol = document.createElement('ol')
        ol.className = 'levels'
        LEVELS.forEach((level, i) => {
          if (level.world === world.id) ol.append(levelItems[i])
        })
        section.append(title, ol)
        return section
      }),
    )
    this.root.hidden = false
    const focusTarget = canContinue
      ? this.continueButton
      : this.list.querySelector<HTMLButtonElement>('.levels button:not(:disabled)')
    focusTarget?.focus({ preventScroll: true })
  }

  /** Træningsbanen: frit skyderi med de våben, man har låst op (en verdens første bane er åben). */
  private trainingSection(progress: Progress): HTMLElement {
    const section = document.createElement('section')
    const title = document.createElement('h2')
    title.className = 'world-title'
    title.textContent = 'Træningsbanen'
    const row = document.createElement('div')
    row.className = 'training'
    const names: Record<Weapon, string> = { laser: 'Laser', grenade: 'Granat', rocket: 'Raket', final: 'Alle våben' }
    for (const world of WORLDS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn'
      button.textContent = names[world.weapon]
      const unlocked = isUnlocked(
        progress,
        LEVELS.findIndex((l) => l.world === world.id),
      )
      button.disabled = !unlocked
      if (!unlocked) button.title = `Åbner, når du når ${world.name}`
      button.addEventListener('click', () => this.cb.onTraining(world.weapon))
      row.append(button)
    }
    section.append(title, row)
    return section
  }

  /** Kortet med ugens udfordring står øverst og er altid åbent. */
  private challengeSection(progress: Progress, challenge: Challenge): HTMLElement {
    const section = document.createElement('section')
    const title = document.createElement('h2')
    title.className = 'world-title'
    title.textContent = 'Ugens udfordring'
    const days = daysUntilNext()
    const next = document.createElement('span')
    next.className = 'world-stars'
    next.textContent = days === 1 ? 'Ny i morgen' : `Ny om ${days} dage`
    title.append(next)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'level challenge'
    button.innerHTML = `
      <span class="level-num"></span>
      <span class="level-text"><b></b><span>Alle får de samme bølger hele ugen. Sammenlign jeres point i klassen.</span></span>
      <span class="level-meta"></span>`
    button.querySelector('.level-num')!.textContent = String(challenge.week.week)
    button.querySelector('b')!.textContent = challenge.level.topic
    const saved = progress.levels[challenge.level.id]
    const meta = button.querySelector('.level-meta')!
    if (saved) {
      meta.innerHTML = `<span class="stars" aria-label="${saved.stars} af 3 stjerner"></span><small></small>`
      meta.querySelector('.stars')!.textContent = starString(saved.stars)
      meta.querySelector('small')!.textContent = `${fmtScore(saved.best)} point`
    } else meta.textContent = 'Ny'
    button.addEventListener('click', () => this.cb.onChallenge())
    section.append(title, button)
    return section
  }

  setMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? 'Lyd: fra' : 'Lyd: til'
  }

  hide(): void {
    this.root.hidden = true
  }
}
