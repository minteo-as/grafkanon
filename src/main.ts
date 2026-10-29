import './style.css';
import { Game, type Shot } from './game/game';
import { ARENA_HALF } from './game/waves';
import { buildArena } from './render/arena';
import { AimLine, Beam } from './render/beam';
import { EnemyLayer } from './render/enemies';
import { Turret } from './render/turret';
import { World } from './render/world';
import { Controls } from './ui/controls';
import { fmtScore, Hud } from './ui/hud';

async function main(): Promise<void> {
  // Vent kort på skrifttyperne, så tallene i 3D tegnes med den rigtige font
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);

  const stage = document.getElementById('stage')!;
  let world: World;
  try {
    world = new World(stage);
  } catch (err) {
    console.error(err);
    stage.classList.add('no-webgl');
    return;
  }

  const game = new Game();
  buildArena(world.scene, ARENA_HALF);
  const turret = new Turret(world.scene, ARENA_HALF);
  const aim = new AimLine(world.scene);
  const beam = new Beam(world.scene);
  const enemies = new EnemyLayer(world.scene);
  const hud = new Hud();

  let shot: Shot | null = null;
  let killed = 0;

  const refresh = () => {
    hud.update(game);
    controls.setFireEnabled(game.phase === 'aiming' && game.ammo > 0);
  };

  const showLine = () => {
    const segment = game.segment;
    controls.showLine(game.line, segment);
    aim.set(game.line, segment, game.help.aimLine);
    turret.aimAt(game.line, segment);
  };

  const loadWave = () => {
    hud.hideOverlay();
    enemies.set(game.enemies, game.help.coordinates);
    hud.hint(game.hint);
    refresh();
  };

  const controls = new Controls({
    onLine: line => {
      game.setLine(line);
      showLine();
    },
    onHelp: help => {
      game.setHelp(help);
      aim.set(game.line, game.segment, help.aimLine);
      enemies.setCoordinatesVisible(help.coordinates);
      refresh();
    },
    onFire: () => {
      if (game.phase !== 'aiming') return;
      if (!game.segment) {
        hud.toast('Linjen rammer ikke banen');
        return;
      }
      shot = game.fire();
      if (!shot) return;
      killed = 0;
      beam.start(shot);
      turret.kick();
      refresh();
    },
  });

  const finishShot = () => {
    const out = game.completeShot();
    shot = null;
    if (out.hits === 0) hud.toast('Forbi!');
    else hud.toast(out.hits > 1 ? `+${fmtScore(out.points)} · ${out.hits} på én linje!` : `+${fmtScore(out.points)}`);
    refresh();

    if (out.phase === 'cleared') {
      const wave = game.wave;
      const text = out.bonus
        ? `${fmtScore(game.pointsThisWave)} point i bølgen, heraf ${fmtScore(out.bonus)} i bonus for ${game.ammo} skud til overs.`
        : `${fmtScore(game.pointsThisWave)} point i bølgen.`;
      window.setTimeout(() => {
        hud.showOverlay(`Bølge ${wave} klaret`, text, 'Næste bølge', () => {
          game.nextWave();
          loadWave();
        });
      }, 650);
    } else if (out.phase === 'outOfAmmo') {
      const left = game.aliveCount;
      window.setTimeout(() => {
        hud.showOverlay(
          'Ikke flere skud',
          `${left} ${left === 1 ? 'glitch' : 'glitches'} tilbage. Kig efter dem, der står på samme linje.`,
          'Prøv bølgen igen',
          () => {
            game.retryWave();
            loadWave();
          },
        );
      }, 650);
    }
  };

  game.setHelp(controls.help);
  game.startWave(1);
  showLine();
  loadWave();

  let visible = true;
  new IntersectionObserver(entries => (visible = entries[0].isIntersecting)).observe(stage);

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible) {
      turret.update(dt);
      enemies.update(dt);
      const progress = beam.update(dt);
      if (shot && progress) {
        while (killed < shot.hits.length && shot.hits[killed].x <= progress.headX + 1e-6) {
          enemies.kill(shot.hits[killed].id);
          world.shake(0.35);
          killed++;
        }
        if (progress.done) finishShot();
      }
      world.render(dt);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main();
