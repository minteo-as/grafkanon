import * as THREE from 'three'

export interface LabelOptions {
  color?: string
  background?: string
  /** Højde i verdensenheder (én enhed = én tern i gitteret). */
  height?: number
  /** Kantfarve rundt om baggrunden. */
  border?: string
  /** Monospace til tal på akserne, brødtekstens skrift til koordinater og talebobler. */
  font?: 'mono' | 'body'
}

const FONT_SIZE = 64
const FONTS = {
  mono: `700 ${FONT_SIZE}px "JetBrains Mono", ui-monospace, Menlo, monospace`,
  body: `700 ${FONT_SIZE}px "Atkinson Hyperlegible", system-ui, sans-serif`,
}

/** En tekst, der altid vender mod kameraet. */
export function textSprite(text: string, opts: LabelOptions = {}): THREE.Sprite {
  const FONT = FONTS[opts.font ?? 'mono']
  const pad = opts.background ? 26 : 10
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = FONT
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2
  const h = FONT_SIZE + 26
  canvas.width = w
  canvas.height = h

  ctx.font = FONT
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.beginPath()
    const inset = opts.border ? 3 : 0
    ctx.roundRect(inset, inset, w - 2 * inset, h - 2 * inset, h / 2 - inset)
    ctx.fill()
    if (opts.border) {
      ctx.lineWidth = 5
      ctx.strokeStyle = opts.border
      ctx.stroke()
    }
  }
  ctx.fillStyle = opts.color ?? '#8ea2c0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 3)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  const height = opts.height ?? 0.55
  sprite.scale.set((height * w) / h, height, 1)
  return sprite
}

export function disposeSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose()
  sprite.material.dispose()
}
