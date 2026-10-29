import * as THREE from 'three';
import type { Shot } from '../game/game';
import { yAt, type Line, type Segment } from '../math/line';
import { COLORS, toWorld } from './world';

const HEIGHT = 0.6;
const GROW = 0.45;
const FADE = 0.3;

/** Den stiplede sigtelinje, der viser grafen før skuddet. */
export class AimLine {
  private line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: COLORS.aim, dashSize: 0.35, gapSize: 0.22 }),
  );

  constructor(scene: THREE.Scene) {
    scene.add(this.line);
  }

  set(line: Line, segment: Segment | null, visible: boolean): void {
    this.line.visible = visible && !!segment;
    if (!segment) return;
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints([
      toWorld(segment.xa, yAt(line, segment.xa), HEIGHT),
      toWorld(segment.xb, yAt(line, segment.xb), HEIGHT),
    ]);
    this.line.computeLineDistances();
  }
}

/** Strålen vokser hen ad grafen og falmer bagefter. */
export class Beam {
  private group = new THREE.Group();
  private glow: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private shot: Shot | null = null;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const core = new THREE.Mesh(new THREE.BoxGeometry(1, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: COLORS.beamCore }));
    this.glow = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.38, 0.38),
      new THREE.MeshBasicMaterial({
        color: COLORS.beam,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.group.add(core, this.glow);
    this.group.visible = false;
    scene.add(this.group);
  }

  start(shot: Shot): void {
    this.shot = shot;
    this.t = 0;
    this.group.visible = true;
  }

  /** Giver strålens forreste x-værdi, og om animationen er færdig. */
  update(dt: number): { headX: number; done: boolean } | null {
    const shot = this.shot;
    if (!shot) return null;
    this.t += dt;
    const { xa, xb } = shot.segment;
    const headX = xa + (xb - xa) * Math.min(1, this.t / GROW);
    const from = toWorld(xa, yAt(shot.line, xa), HEIGHT);
    const to = toWorld(headX, yAt(shot.line, headX), HEIGHT);
    const fade = this.t > GROW ? Math.max(0, 1 - (this.t - GROW) / FADE) : 1;
    this.group.position.copy(from).lerp(to, 0.5);
    this.group.rotation.y = Math.atan(shot.line.a);
    const thickness = 0.3 + 0.7 * fade;
    this.group.scale.set(Math.max(0.001, from.distanceTo(to)), thickness, thickness);
    this.glow.material.opacity = 0.3 * fade;

    const done = this.t >= GROW + FADE;
    if (done) {
      this.group.visible = false;
      this.shot = null;
    }
    return { headX, done };
  }
}
