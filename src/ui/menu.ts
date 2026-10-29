import { LEVELS } from '../game/levels';
import { isUnlocked, type Progress } from '../game/progress';
import { fmtScore } from './hud';

export interface MenuCallbacks {
  onPlay(levelIndex: number): void;
  onContinue(): void;
  onToggleSound(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const starString = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);

export class Menu {
  private root = $('menu');
  private list = $('levelList');
  private continueButton = $<HTMLButtonElement>('menuContinue');
  private soundButton = $<HTMLButtonElement>('menuSound');

  constructor(private cb: MenuCallbacks) {
    this.continueButton.addEventListener('click', () => cb.onContinue());
    this.soundButton.addEventListener('click', () => cb.onToggleSound());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(progress: Progress, canContinue: boolean, muted: boolean): void {
    this.continueButton.hidden = !canContinue;
    this.setMuted(muted);
    this.list.replaceChildren(
      ...LEVELS.map((level, i) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'level';
        const unlocked = isUnlocked(progress, i);
        const saved = progress.levels[level.id];
        button.disabled = !unlocked;
        button.innerHTML = `
          <span class="level-num">${i + 1}</span>
          <span class="level-text"><b></b><span></span></span>
          <span class="level-meta"></span>`;
        button.querySelector('b')!.textContent = level.name;
        button.querySelector('.level-text span')!.textContent = level.topic;
        const meta = button.querySelector('.level-meta')!;
        if (!unlocked) meta.textContent = 'Låst';
        else if (saved) {
          meta.innerHTML = `<span class="stars" aria-label="${saved.stars} af 3 stjerner"></span><small></small>`;
          meta.querySelector('.stars')!.textContent = starString(saved.stars);
          meta.querySelector('small')!.textContent = `${fmtScore(saved.best)} point`;
        } else meta.textContent = 'Ny';
        button.addEventListener('click', () => this.cb.onPlay(i));
        li.append(button);
        return li;
      }),
    );
    this.root.hidden = false;
    const focusTarget = canContinue ? this.continueButton : this.list.querySelector<HTMLButtonElement>('button:not(:disabled)');
    focusTarget?.focus({ preventScroll: true });
  }

  setMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? 'Lyd: fra' : 'Lyd: til';
  }

  hide(): void {
    this.root.hidden = true;
  }
}
