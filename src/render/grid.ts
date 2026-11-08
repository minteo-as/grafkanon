import * as THREE from 'three'

const MAX_RIPPLES = 6
const RIPPLE_SPEED = 9 // enheder i sekundet
const RIPPLE_LIFE = 1.3

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform vec2 uCenter;
  uniform vec2 uHalf;
  uniform float uSide;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying vec3 vWorld;

  float gridLine(vec2 coord) {
    vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    // På gulvet ligger gitteret i x og z, i sidebilledet i x og y
    vec2 coord = uSide > 0.5 ? vWorld.xy : vec2(vWorld.x, -vWorld.z);
    vec2 rel = (coord - uCenter) / uHalf;
    float fade = 1.0 - smoothstep(0.8, 1.08, max(abs(rel.x), abs(rel.y)));

    float minor = gridLine(coord);
    float major = gridLine(coord / 5.0);

    // En svag scanning, der glider hen over gitteret, som på et hologram
    float sweep = fract(uTime * 0.07) * (uHalf.y * 2.0 + 8.0) - uHalf.y - 4.0;
    float scan = exp(-pow((coord.y - uCenter.y) - sweep, 2.0) / 3.0) * 0.5;

    // Ringe, der breder sig ud fra hvert træf
    float ripple = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.w;
      if (age < 0.0 || age > ${RIPPLE_LIFE.toFixed(2)}) continue;
      float d = distance(coord, r.xy);
      float front = exp(-pow((d - age * ${RIPPLE_SPEED.toFixed(1)}) / 0.8, 2.0));
      ripple += front * (1.0 - age / ${RIPPLE_LIFE.toFixed(2)});
    }

    float lines = minor * (0.32 + scan + ripple * 1.6) + major * (0.6 + scan + ripple * 2.0);
    vec3 color = mix(uColor, uGlow, clamp(ripple + scan * 0.5, 0.0, 1.0)) * lines;
    color += uGlow * ripple * 0.08;
    float alpha = clamp(lines + ripple * 0.1, 0.0, 1.0) * fade;
    gl_FragColor = vec4(color * fade, alpha);
  }
`

export interface HoloGridOptions {
  /** Gulvet (Linjebyen) eller en lodret væg bag dronerne (sidebillederne). */
  orientation: 'floor' | 'side'
  /** Midten af gitteret og halvdelen af dets bredde og højde, i 3D-koordinater (y på gulvet er −z). */
  center: THREE.Vector2
  half: THREE.Vector2
  color: number
  glow: number
}

/** Et lysende gitter, der toner ud mod kanten og sender ringe ud, når noget bliver ramt. */
export class HoloGrid {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, -100))
  private next = 0
  private time = 0

  constructor(private opts: HoloGridOptions) {
    const margin = 1.5
    const geo = new THREE.PlaneGeometry(2 * opts.half.x + margin, 2 * opts.half.y + margin)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(opts.color) },
        uGlow: { value: new THREE.Color(opts.glow) },
        uCenter: { value: opts.center.clone() },
        uHalf: { value: opts.half.clone() },
        uSide: { value: opts.orientation === 'side' ? 1 : 0 },
        uRipples: { value: this.ripples },
      },
    })
    this.mesh = new THREE.Mesh(geo, material)
    if (opts.orientation === 'floor') {
      this.mesh.rotation.x = -Math.PI / 2
      this.mesh.position.set(opts.center.x, 0.012, -opts.center.y)
    } else {
      this.mesh.position.set(opts.center.x, opts.center.y, -0.05)
    }
  }

  /** Sender en ring ud fra et punkt i 3D, fx en glitch, der bliver ramt. */
  ripple(at: THREE.Vector3): void {
    const coord = this.opts.orientation === 'side' ? [at.x, at.y] : [at.x, -at.z]
    this.ripples[this.next].set(coord[0], coord[1], 0, this.time)
    this.next = (this.next + 1) % MAX_RIPPLES
  }

  update(dt: number): void {
    this.time += dt
    this.mesh.material.uniforms.uTime.value = this.time
  }
}
