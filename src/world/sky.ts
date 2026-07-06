import * as THREE from "three";
import { PALETTE } from "./palette.ts";

// Original procedural sky (T33): a three-stop gradient dome (zenith -> mid ->
// horizon) rendered on the inside of a large sphere, a horizon-band cumulus
// layer from 4-octave domain-warped value noise (fully deterministic, no time
// uniform), and a sharpened sun disc with glow. No cubemap or image assets.

const SKY_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;

  // Deterministic value noise (no time input): hash -> bilinear -> 4-octave fbm
  // with a domain warp so the cumulus reads as billows rather than smooth blobs.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * vnoise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Three-stop gradient: horizon -> mid (around eye level) -> zenith.
    float lo = smoothstep(0.5, 0.72, h);
    float hi = smoothstep(0.72, 1.0, h);
    vec3 sky = mix(uHorizon, uMid, lo);
    sky = mix(sky, uZenith, hi);

    // Horizon-band cumulus. Project the dome onto a plane (no azimuth seam) so
    // clouds stretch toward the horizon and shrink overhead.
    vec2 cp = dir.xz / (abs(dir.y) + 0.35);
    vec2 warp = vec2(fbm(cp * 1.6 + 3.1), fbm(cp * 1.6 + 8.7));
    float n = fbm(cp * 1.9 + warp * 1.5);
    float coverage = smoothstep(0.52, 0.78, n);
    // Band mask: clouds live above the horizon and fade out before the zenith.
    float band = smoothstep(0.02, 0.18, dir.y) * (1.0 - smoothstep(0.4, 0.8, dir.y));
    float cloud = coverage * band;

    // Sun-tinted cloud shading: lit tops warm, undersides cooler.
    float sun = max(dot(dir, normalize(uSunDir)), 0.0);
    vec3 cloudLit = mix(vec3(0.98, 0.98, 1.0), uSunColor, 0.30);
    vec3 cloudShadow = vec3(0.62, 0.66, 0.74);
    vec3 cloudCol = mix(cloudShadow, cloudLit, smoothstep(0.2, 0.9, n) * (0.5 + 0.5 * sun));
    vec3 col = mix(sky, cloudCol, cloud);

    // Sharpened sun: a tight core plus a soft glow, unobscured by cloud cover.
    float glow = pow(sun, 96.0) * 0.5 + pow(sun, 2048.0) * 1.6;
    col += uSunColor * glow * (1.0 - 0.6 * cloud);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface Sky {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  sunDirection: THREE.Vector3;
}

export function makeSky(radius = 480): Sky {
  const sunDirection = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
      uMid: { value: new THREE.Color(PALETTE.skyMid) },
      uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      uSunDir: { value: sunDirection.clone() },
      uSunColor: { value: new THREE.Color(PALETTE.sunGlow) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.name = "sky";
  // The sky follows the camera implicitly by being huge and centered; we keep
  // it at the origin and rely on its radius so the horizon never clips.
  mesh.frustumCulled = false;
  return { mesh, material, sunDirection };
}
