import * as THREE from 'three';

export interface LabelOptions {
  color?: string;
  background?: string;
  /** Højde i verdensenheder (én enhed = én tern i gitteret). */
  height?: number;
}

const FONT_SIZE = 64;
const FONT = `700 ${FONT_SIZE}px "JetBrains Mono", ui-monospace, Menlo, monospace`;

/** En tekst, der altid vender mod kameraet. */
export function textSprite(text: string, opts: LabelOptions = {}): THREE.Sprite {
  const pad = opts.background ? 22 : 10;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = FONT;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = FONT_SIZE + 26;
  canvas.width = w;
  canvas.height = h;

  ctx.font = FONT;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? '#8ea2c0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  const height = opts.height ?? 0.55;
  sprite.scale.set((height * w) / h, height, 1);
  return sprite;
}

export function disposeSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
