import * as THREE from "three";
import { Game, type System } from "../core/game.ts";
import { buildHero, type Hero } from "./hero.ts";

// Turntable review scene, reachable via ?turntable. Shows the hero on a rotating
// studio platform with controls to pose bones so joint bends can be inspected
// for skinning artifacts. Exposed on window for Playwright screenshots.

class Turntable implements System {
  readonly name = "turntable";
  readonly hero: Hero;
  private angle = 0;
  autoRotate = true;

  constructor() {
    this.hero = buildHero();
  }

  init(game: Game): void {
    game.scene.background = new THREE.Color(0x1a2730);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.2, 0.1, 48),
      new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.8 }),
    );
    platform.position.y = -0.05;
    platform.receiveShadow = true;
    game.scene.add(platform);

    game.scene.add(new THREE.HemisphereLight(0xdfeffb, 0x2a343c, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    game.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88bbdd, 0.8);
    rim.position.set(-3, 2, -4);
    game.scene.add(rim);

    game.scene.add(this.hero.group);

    game.camera.position.set(0, 1.2, 3.1);
    game.camera.lookAt(0, 0.95, 0);
    game.camera.fov = 45;
    game.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.autoRotate) this.angle += dt * 0.5;
    this.hero.group.rotation.y = this.angle;
  }

  setAngle(a: number): void {
    this.angle = a;
    this.autoRotate = false;
  }

  dispose(): void {
    this.hero.dispose();
  }
}

export function bootTurntable(app: HTMLElement): void {
  const game = new Game({ parent: app });
  const tt = new Turntable();
  game.add(tt);
  game.start();

  (
    window as unknown as {
      __turntable?: {
        game: Game;
        hero: Hero;
        setAngle: (a: number) => void;
        poseBone: (name: string, x: number, y: number, z: number) => void;
        reset: () => void;
      };
    }
  ).__turntable = {
    game,
    hero: tt.hero,
    setAngle: (a) => tt.setAngle(a),
    poseBone: (name, x, y, z) => {
      const bone = tt.hero.bones.get(name);
      if (bone) bone.rotation.set(x, y, z);
    },
    reset: () => {
      for (const bone of tt.hero.bones.values()) bone.rotation.set(0, 0, 0);
    },
  };
  (window as unknown as { __fortReady?: boolean }).__fortReady = true;
}
