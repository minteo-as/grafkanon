import type { Game } from '../game/game';
import { fmtNum } from '../math/format';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const fmtScore = (n: number): string => n.toLocaleString('da-DK');

export class Hud {
  private wave = $('hudWave');
  private ammo = $('hudAmmo');
  private score = $('hudScore');
  private mult = $('hudMult');
  private multNext = $('hudMultNext');
  private hintEl = $('hint');
  private toastEl = $('toast');
  private overlay = $('overlay');
  private overlayTitle = $('overlayTitle');
  private overlayText = $('overlayText');
  private overlayButton = $<HTMLButtonElement>('overlayButton');
  private toastTimer = 0;

  update(game: Game): void {
    this.wave.textContent = String(game.wave);
    const used = game.ammoTotal - game.ammo;
    this.ammo.textContent = '●'.repeat(game.ammo) + '○'.repeat(used);
    this.ammo.setAttribute('aria-label', `${game.ammo} af ${game.ammoTotal} skud tilbage`);
    this.score.textContent = fmtScore(game.score);
    this.mult.textContent = '×' + fmtNum(game.multiplier);
    const next = game.nextMultiplier;
    this.multNext.hidden = next === game.multiplier;
    this.multNext.textContent = `×${fmtNum(next)} fra næste bølge`;
  }

  hint(text: string): void {
    this.hintEl.textContent = text;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth; // genstart animationen
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1500);
  }

  showOverlay(title: string, text: string, button: string, onClick: () => void): void {
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    this.overlayButton.textContent = button;
    this.overlayButton.onclick = onClick;
    this.overlay.hidden = false;
    this.overlayButton.focus({ preventScroll: true });
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }
}
