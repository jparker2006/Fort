import * as THREE from "three";

// Original procedural sky: a gradient dome (zenith to horizon) rendered on the
// inside of a large sphere, plus a soft sun disc. No cubemap assets.

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
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(uHorizon, uZenith, pow(h, 0.8));

    // Soft sun glow plus a brighter core.
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    float glow = pow(d, 64.0) * 0.6 + pow(d, 512.0) * 1.4;
    vec3 col = sky + uSunColor * glow;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface Sky {
  mesh: THREE.Mesh;
  sunDirection: THREE.Vector3;
}

export function makeSky(radius = 480): Sky {
  const sunDirection = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x2f6fb0) },
      uHorizon: { value: new THREE.Color(0xbfe4ec) },
      uSunDir: { value: sunDirection.clone() },
      uSunColor: { value: new THREE.Color(0xfff2cc) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.name = "sky";
  // The sky follows the camera implicitly by being huge and centered; we keep
  // it at the origin and rely on its radius so the horizon never clips.
  mesh.frustumCulled = false;
  return { mesh, sunDirection };
}
