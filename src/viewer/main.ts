declare const Phaser: any;

import { WorldScene } from './scenes/WorldScene.js';

function getWorldPath(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('world') || '/output/world.json';
}

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#111111',
  scene: [WorldScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

// Store worldPath so the scene can access it
game.registry.set('worldPath', getWorldPath());
