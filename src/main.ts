import "./style.css";
import { Game, type System } from "./core/game.ts";
import { World } from "./world/island.ts";
import { InputSystem } from "./input/input-system.ts";
import { DebugInputOverlay } from "./input/debug-input-overlay.ts";

// T04 bootstrap: island plus the input action map. The default camera is a
// review vantage; T05 replaces it with the third-person rig.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

const game = new Game({ parent: app });

const input = new InputSystem();
input.setEnabled(true); // T18 gates this behind pointer lock; on for early review
game.add(input);
game.add(new World());

// Live action-state overlay (toggle with Backslash).
const inputOverlay = new DebugInputOverlay(app, input);
game.add({
  name: "input-overlay",
  update: () => inputOverlay.update(),
} satisfies System);

// Review vantage: stand back and above, looking at the island center.
game.camera.position.set(46, 34, 46);
game.camera.lookAt(0, 0, 0);
game.camera.far = 2000;
game.camera.updateProjectionMatrix();

game.start();

(window as unknown as { __fort?: { game: Game; input: InputSystem } }).__fort = { game, input };
(window as unknown as { __fortReady?: boolean }).__fortReady = true;
