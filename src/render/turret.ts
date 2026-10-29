import * as THREE from 'three';
import { yAt, type Line, type Segment } from '../math/line';
import { COLORS, toWorld } from './world';

const BARREL_X = 0.6;

/** Kanonen kører langs kanten hen til det sted, hvor linjen går ind i banen. */
export class Turret {
  private group = new THREE.Group();
  private head: THREE.Mesh;
  private barrel: THREE.Mesh;
  private targetPosition: THREE.Vector3;
  private targetRotation = 0;
  private recoil = 0;

  constructor(scene: THREE.Scene, private half: number) {
    const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.turret, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.35, 8), baseMat);
    base.position.y = 0.2;
    this.head = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.38, 0.55),
      new THREE.MeshStandardMaterial({ color: COLORS.turretHead, flatShading: true }),
    );
    this.head.position.y = 0.55;
    this.barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: COLORS.beam, emissive: 0x0d4a5a }),
    );
    this.barrel.rotation.z = -Math.PI / 2;
    this.barrel.position.set(BARREL_X, 0.55, 0);
    this.group.add(base, this.head, this.barrel);
    scene.add(this.group);

    this.targetPosition = this.parkedPosition();
    this.group.position.copy(this.targetPosition);
  }

  aimAt(line: Line, segment: Segment | null): void {
    if (!segment) {
      this.targetPosition = this.parkedPosition();
      this.targetRotation = 0;
      return;
    }
    const len = Math.hypot(1, line.a);
    const dx = 1 / len;
    const dy = line.a / len;
    this.targetPosition = toWorld(segment.xa - dx * 0.8, yAt(line, segment.xa) - dy * 0.8);
    this.targetRotation = Math.atan(line.a);
  }

  kick(): void {
    this.recoil = 1;
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 12);
    this.group.position.lerp(this.targetPosition, k);
    this.group.rotation.y += (this.targetRotation - this.group.rotation.y) * k;
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.barrel.position.x = BARREL_X - this.recoil * 0.25;
    const s = 1 + this.recoil * 0.12;
    this.head.scale.set(s, s, s);
  }

  private parkedPosition(): THREE.Vector3 {
    return toWorld(-this.half - 0.8, 0);
  }
}
