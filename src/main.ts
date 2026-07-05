import "./style.css";
import * as THREE from "three";

// T01 bootstrap: prove a WebGL2 canvas renders with no console errors.
// T02 replaces this body with the real engine loop and Game object.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.classList.add("fort-canvas");
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12313a);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x33c4c4 }),
);
scene.add(cube);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

renderer.setAnimationLoop(() => {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.013;
  renderer.render(scene, camera);
});

// Expose a readiness flag for Playwright to await first paint.
(window as unknown as { __fortReady?: boolean }).__fortReady = true;
