import * as THREE from 'three';
import { fmtNum } from '../math/format';
import { textSprite } from './labels';
import { COLORS, toWorld } from './world';

/** Gulv, gitter, akser med tal og kanten rundt om banen. */
export function buildArena(scene: THREE.Scene, half: number): void {
  const size = 2 * half;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 3, size + 3),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const grid = new THREE.GridHelper(size, size, COLORS.gridMain, COLORS.grid);
  grid.position.y = 0.01;
  scene.add(grid);

  const axisMat = new THREE.MeshBasicMaterial({ color: COLORS.axis });
  const xAxis = new THREE.Mesh(new THREE.BoxGeometry(size + 1, 0.03, 0.07), axisMat);
  const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, size + 1), axisMat);
  xAxis.position.y = yAxis.position.y = 0.02;
  scene.add(xAxis, yAxis);

  for (let v = -half; v <= half; v += 2) {
    if (v === 0) continue;
    const onX = textSprite(fmtNum(v));
    onX.position.copy(toWorld(v, -0.55, 0.25));
    const onY = textSprite(fmtNum(v));
    onY.position.copy(toWorld(-0.6, v, 0.25));
    scene.add(onX, onY);
  }
  const xName = textSprite('x', { color: '#dce6f4', height: 0.7 });
  xName.position.copy(toWorld(half + 0.5, 0.5, 0.3));
  const yName = textSprite('y', { color: '#dce6f4', height: 0.7 });
  yName.position.copy(toWorld(0.5, half + 0.5, 0.3));
  scene.add(xName, yName);

  // Kanten, som kanonen kører rundt på
  const rimMat = new THREE.MeshStandardMaterial({ color: COLORS.rim, roughness: 0.8 });
  const edge = half + 0.9;
  const long = size + 2.2;
  const sides: [number, number, number, number][] = [
    [0, -edge, long, 0.5],
    [0, edge, long, 0.5],
    [-edge, 0, 0.5, long],
    [edge, 0, 0.5, long],
  ];
  for (const [x, y, w, d] of sides) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), rimMat);
    rim.position.copy(toWorld(x, y, 0.12));
    scene.add(rim);
  }
}
