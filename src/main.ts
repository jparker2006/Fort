import "./style.css";
import { Game } from "./core/game.ts";
import { World } from "./world/island.ts";

// T03 bootstrap: render the creative island. The default camera is placed at a
// review vantage overlooking the island; T05 replaces it with the third-person
// rig. T04's input layer and later systems attach here too.

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

const game = new Game({ parent: app });

game.add(new World());

// Review vantage: stand back and above, looking at the island center.
game.camera.position.set(46, 34, 46);
game.camera.lookAt(0, 0, 0);
game.camera.far = 2000;
game.camera.updateProjectionMatrix();

game.start();

(window as unknown as { __fort?: { game: Game } }).__fort = { game };
(window as unknown as { __fortReady?: boolean }).__fortReady = true;
