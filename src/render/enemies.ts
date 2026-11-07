import * as THREE from 'three';
import type { Enemy } from '../game/game';
import { fmtPoint } from '../math/format';
import type { Effects } from './effects';
import { disposeSprite, textSprite } from './labels';
import { COLORS, FLOOR, prefersReducedMotion, type Plane } from './world';

const BODY_HEIGHT = 0.6;
const SPAWN_TIME = 0.35;
const DIE_TIME = 0.3;
const HOP_TIME = 0.25;

interface View {
  group: THREE.Group;
  baseY: number; // kroppens højde over punktet
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
  marcher: boolean;
  color: number;
  cell: { x: number; y: number };
  hopFrom: THREE.Vector3;
  hopTo: THREE.Vector3;
  hopT: number; // 1 = ikke i gang
  phase: number;
  age: number;
  delay: number;
  dying: number; // 0 = lever, > 0 = sekunder siden den blev ramt
}

const staticGeo = new THREE.IcosahedronGeometry(0.42, 0);
const marcherGeo = new THREE.OctahedronGeometry(0.48, 0);
const ringGeo = new THREE.RingGeometry(0.32, 0.46, 20);
const arrowGeo = new THREE.ConeGeometry(0.2, 0.45, 3);
const rotorGeo = new THREE.TorusGeometry(0.62, 0.05, 6, 24);

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

const labelFor = (x: number, y: number, marcher: boolean) =>
  textSprite(fmtPoint(x, y), {
    color: marcher ? '#efe2ff' : '#ffe3d6',
    background: marcher ? 'rgba(40,16,72,0.88)' : 'rgba(60,20,8,0.85)',
    height: 0.5,
  });

export class EnemyLayer {
  private views = new Map<number, View>();
  private time = 0;
  private reduced = prefersReducedMotion();
  private showCoordinates = true;
  private plane: Plane = FLOOR;

  constructor(private scene: THREE.Scene, private effects: Effects) {}

  setPlane(plane: Plane): void {
    this.plane = plane;
  }

  /** Erstatter alle glitches med en ny bølge. */
  set(enemies: Enemy[], showCoordinates: boolean): void {
    for (const v of this.views.values()) this.remove(v);
    this.views.clear();
    this.showCoordinates = showCoordinates;
    enemies.forEach((e, i) => {
      const marcher = !!e.march;
      const side = this.plane.view === 'side';
      // I sidebilledet svæver droner i luften; glitches på jorden sidder oven på jorden
      const drone = side && e.y > 0;
      const color = marcher ? COLORS.marcher : drone ? COLORS.drone : COLORS.enemy;
      const baseY = side ? (drone ? 0 : 0.42) : BODY_HEIGHT;
      const group = new THREE.Group();
      group.position.copy(this.plane.toWorld(e.x, e.y));
      const body = new THREE.Mesh(
        marcher ? marcherGeo : staticGeo,
        new THREE.MeshStandardMaterial({
          color,
          emissive: marcher ? COLORS.marcherGlow : drone ? COLORS.droneGlow : COLORS.enemyGlow,
          flatShading: true,
          transparent: true,
        }),
      );
      body.position.y = baseY;
      group.add(body);
      if (!side) {
        const ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        group.add(ring);
      } else if (drone) {
        const rotor = new THREE.Mesh(rotorGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
        rotor.rotation.x = Math.PI / 2;
        body.add(rotor);
      }

      if (e.march) {
        // Pil på gulvet, der viser hvilken vej marchøren går
        const pivot = new THREE.Group();
        pivot.rotation.y = Math.atan2(-e.march.dx, e.march.dy);
        const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: COLORS.marcher }));
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.set(0, 0.05, -0.8);
        pivot.add(arrow);
        group.add(pivot);
      }

      const label = labelFor(e.x, e.y, marcher);
      label.position.y = baseY + 0.85;
      label.visible = showCoordinates;
      group.add(label);
      group.scale.setScalar(0.001);
      this.scene.add(group);
      this.views.set(e.id, {
        group,
        baseY,
        color,
        body,
        label,
        marcher,
        cell: { x: e.x, y: e.y },
        hopFrom: group.position.clone(),
        hopTo: group.position.clone(),
        hopT: 1,
        phase: i * 1.3 + Math.random(),
        age: 0,
        delay: i * 0.07,
        dying: 0,
      });
    });
  }

  setCoordinatesVisible(visible: boolean): void {
    this.showCoordinates = visible;
    for (const v of this.views.values()) if (v.dying === 0) v.label.visible = visible;
  }

  /** Sprænger glitchen og viser pointene for træfferen. */
  kill(id: number, pointsText: string): void {
    const v = this.views.get(id);
    if (!v || v.dying > 0) return;
    v.dying = 1e-4;
    v.label.visible = false;
    const at = v.group.position.clone().add(new THREE.Vector3(0, v.baseY, 0));
    this.effects.explosion(at, v.color, this.plane.view);
    this.effects.floatingText(at, pointsText, '#ffd166');
  }

  update(dt: number, enemies: Enemy[]): void {
    this.time += dt;
    for (const e of enemies) {
      const v = this.views.get(e.id);
      if (!v || !e.alive || (e.x === v.cell.x && e.y === v.cell.y)) continue;
      // Marchøren har taget et skridt: hop derhen og skift koordinaterne
      v.cell = { x: e.x, y: e.y };
      v.hopFrom.copy(v.group.position);
      v.hopTo.copy(this.plane.toWorld(e.x, e.y));
      v.hopT = 0;
      v.group.remove(v.label);
      disposeSprite(v.label);
      v.label = labelFor(e.x, e.y, v.marcher);
      v.label.position.y = v.baseY + 0.85;
      v.label.visible = this.showCoordinates;
      v.group.add(v.label);
    }

    for (const v of this.views.values()) {
      v.age += dt;
      if (v.hopT < 1) {
        v.hopT = Math.min(1, v.hopT + dt / HOP_TIME);
        v.group.position.lerpVectors(v.hopFrom, v.hopTo, v.hopT);
        v.group.position.y = Math.sin(Math.PI * v.hopT) * 0.6;
      }
      if (v.dying === 0) {
        const t = Math.min(1, Math.max(0, (v.age - v.delay) / SPAWN_TIME));
        v.group.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        if (!this.reduced) {
          v.body.position.y = v.baseY + Math.sin(this.time * 2.2 + v.phase) * 0.08;
          v.body.rotation.y += dt * (v.marcher ? 1.6 : 0.9);
          v.body.rotation.x += dt * 0.4;
        }
      } else if (v.group.visible) {
        v.dying += dt;
        v.body.scale.setScalar(1 + v.dying * 4);
        v.body.material.opacity = Math.max(0, 1 - v.dying / DIE_TIME);
        if (v.dying > DIE_TIME) v.group.visible = false;
      }
    }
  }

  private remove(v: View): void {
    this.scene.remove(v.group);
    v.body.material.dispose();
    disposeSprite(v.label);
  }
}
