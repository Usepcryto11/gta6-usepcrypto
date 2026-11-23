// Drawing only: the world's state and the current screen in, pixels out. A camera
// follows the player across the 3200x2400 city; the HUD (cash, health, wanted
// stars, mission objective, minimap) is drawn in screen space. Flat shapes and
// canvas text — no images, no network.
import { DISTRICTS, FONT, PALETTE, WORLD } from './config.js';
import { ROAD_W } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const VIEW_W = 1280;
const VIEW_H = 720;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, camX: 0, camY: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    view.x = (canvas.width - VIEW_W * view.scale) / 2;
    view.y = (canvas.height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawCity(state) {
    const city = state.city;
    // Ground, beach and water.
    rect(0, 0, WORLD.width, WORLD.height, PALETTE.grass);
    rect(0, 2100, WORLD.width, 190, PALETTE.sand);
    rect(0, 2290, WORLD.width, WORLD.height - 2290, PALETTE.water);
    // District labels on the ground.
    for (const d of DISTRICTS) {
      text(d.name, d.x + d.w / 2, d.y + d.h / 2, 44, 'rgba(255,255,255,0.16)', 'center', 'middle');
    }
    // Parks.
    for (const park of city.parks) {
      rect(park.x, park.y, park.w, park.h, PALETTE.park);
      for (const t of park.trees) {
        circle(t.x, t.y, t.r, '#4e7d3a');
        circle(t.x - 4, t.y - 4, t.r * 0.6, '#5d9445');
      }
    }
    // Roads with centre dashes.
    for (const rx of city.roadsX) rect(rx - ROAD_W / 2, 0, ROAD_W, 2290, PALETTE.road);
    for (const ry of city.roadsY) rect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W, PALETTE.road);
    context.fillStyle = PALETTE.roadLine;
    for (const rx of city.roadsX) {
      for (let y = 0; y < 2290; y += 80) context.fillRect(rx - 2, y, 4, 40);
    }
    for (const ry of city.roadsY) {
      for (let x = 0; x < WORLD.width; x += 80) context.fillRect(x, ry - 2, 40, 4);
    }
    // Buildings: base, roof inset, windows.
    for (const b of city.buildings) {
      rect(b.x, b.y, b.w, b.h, b.color);
      rect(b.x + 8, b.y + 8, b.w - 16, b.h - 16, b.roof);
      context.fillStyle = 'rgba(255, 244, 180, 0.55)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx * 7 + cy * 3 + b.hgt) % 3 === 0) continue;
          context.fillRect(b.x + 14 + cx * 34, b.y + 14 + cy * 34, 12, 12);
        }
      }
    }
    // Mission target marker: a pulsing diamond on the ground.
    const t = state.missionTarget;
    if (t) {
      const pulse = 1 + 0.15 * Math.sin(state.time * 4);
      context.save();
      context.translate(t.x, t.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.mission;
      const s = 26 * pulse;
      context.fillRect(-s / 2, -s / 2, s, s);
      context.restore();
      text(t.name || 'Target', t.x, t.y - 34, 20, PALETTE.mission, 'center', 'middle');
    }
    // Pickups.
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      if (pk.kind === 'cash') circle(pk.x, pk.y, 10, '#ffd23f');
      else if (pk.kind === 'health') {
        rect(pk.x - 10, pk.y - 4, 20, 8, '#ffffff');
        rect(pk.x - 4, pk.y - 10, 8, 20, '#ffffff');
      } else {
        rect(pk.x - 9, pk.y - 6, 18, 12, '#9aa0a8');
        text('A', pk.x, pk.y + 5, 13, '#222', 'center', 'middle');
      }
    }
  }

  function drawCar(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const len = 54;
    const wid = 26;
    rect(-len / 2, -wid / 2, len, wid, car.color);
    // Windshield and roof.
    rect(-6, -wid / 2 + 3, 14, wid - 6, 'rgba(20, 30, 44, 0.85)');
    rect(10, -wid / 2 + 4, 10, wid - 8, 'rgba(255,255,255,0.25)');
    if (car.kind === 'police') {
      rect(-len / 2 + 4, -wid / 2, 10, wid, '#ffffff');
      text('PD', 0, 5, 11, '#111', 'center', 'middle');
    }
    if (car.kind === 'player') {
      rect(-len / 2, -wid / 2, 6, wid, '#ffd23f');
    }
    context.restore();
    // Police light bar flash.
    if (car.kind === 'police') {
      const on = Math.floor(stateTime(car) * 6) % 2 === 0;
      circle(car.x - 8, car.y - 8, 5, on ? '#ff3b30' : '#3b82ff');
      circle(car.x - 8, car.y + 8, 5, on ? '#3b82ff' : '#ff3b30');
    }
    function stateTime() { return performance.now() / 1000; }
  }

  function drawWorld(state) {
    drawCity(state);
    for (const ped of state.peds) {
      if (ped.down > 0) {
        context.save();
        context.translate(ped.x, ped.y);
        context.rotate(1.2);
        rect(-9, -5, 18, 10, ped.color);
        context.restore();
        continue;
      }
      circle(ped.x, ped.y, 9, ped.color);
      circle(ped.x, ped.y - 3, 5, '#2b2118');
    }
    for (const car of state.cars) drawCar(car);
    // Bullets.
    for (const b of state.bullets) {
      circle(b.x, b.y, 3, '#ffe08a');
    }
    // Player on foot.
    const p = state.player;
    if (!p.inCar) {
      if (p.hurtCd <= 0 || Math.floor(p.hurtCd * 10) % 2 === 0) {
        circle(p.x, p.y, 13, PALETTE.player);
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.angle);
        rect(8, -4, 12, 8, '#2b2118');
        context.restore();
        circle(p.x, p.y, 5, '#2b2118');
      }
    }
  }

  function drawMinimap(state) {
    const size = 190;
    const x0 = VIEW_W - size - 16;
    const y0 = VIEW_H - size - 16;
    const sx = size / WORLD.width;
    const sy = size / WORLD.height;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x0 - 6, y0 - 6, size + 12, size + 12);
    rect(x0, y0, size, size, '#2c4a2e');
    context.fillStyle = '#555';
    for (const rx of state.city.roadsX) context.fillRect(x0 + rx * sx - 1, y0, 2, size);
    for (const ry of state.city.roadsY) context.fillRect(x0, y0 + ry * sy, size, 2);
    const t = state.missionTarget;
    if (t) {
      context.fillStyle = PALETTE.mission;
      context.beginPath();
      context.arc(x0 + t.x * sx, y0 + t.y * sy, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.kind === 'police') circle(x0 + car.x * sx, y0 + car.y * sy, 3, '#4d8dff');
    }
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    circle(x0 + px * sx, y0 + py * sy, 5, PALETTE.player);
    context.strokeStyle = '#fff';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x0 + px * sx, y0 + py * sy, 7, 0, Math.PI * 2);
    context.stroke();
  }

  function drawHud(state, best) {
    const p = state.player;
    context.fillStyle = PALETTE.panel;
    context.fillRect(12, 12, 300, 86);
    text(`$${state.cash}`, 24, 40, 28, '#ffd23f', 'left', 'top');
    text(`Ammo ${p.ammo}`, 24, 70, 18, PALETTE.text, 'left', 'top');
    // Health bar.
    rect(150, 24, 140, 16, '#333');
    rect(150, 24, 140 * Math.max(0, p.health) / 100, 16, p.health > 30 ? PALETTE.health : PALETTE.damage);
    text('HP', 150, 62, 16, PALETTE.text, 'left', 'top');
    // Wanted stars, top right.
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '☆';
    text(stars, VIEW_W - 16, 16, 34, PALETTE.star, 'right', 'top');
    // Mission objective, top centre.
    if (state.missionTarget) {
      const m = state.missionTarget;
      context.fillStyle = PALETTE.panel;
      const label = `Mission: ${m.name || ''}`;
      context.fillRect(VIEW_W / 2 - 190, 12, 380, 34);
      text(label, VIEW_W / 2, 36, 20, PALETTE.mission, 'center', 'middle');
      if (state.missionTimer > 0) text(`${Math.ceil(state.missionTimer)}s`, VIEW_W / 2, 62, 18, '#ff8a7a', 'center', 'top');
    }
    // Message toast.
    if (state.messageTimer > 0 && state.message) {
      context.fillStyle = PALETTE.panel;
      const w = Math.min(760, 40 + state.message.length * 9);
      context.fillRect(VIEW_W / 2 - w / 2, 96, w, 36);
      text(state.message, VIEW_W / 2, 120, 20, PALETTE.text, 'center', 'middle');
    }
    // Speed and controls, bottom left.
    const speed = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.12) : 0;
    text(p.inCar ? `${speed} mph  •  E exit  •  P pause` : 'WASD move  •  E enter car  •  Space shoot  •  G save  •  P pause', 16, VIEW_H - 16, 16, PALETTE.muted, 'left', 'bottom');
    drawMinimap(state);
    void best;
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (VIEW_W - width) / 2;
    const y = (VIEW_H - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    text(title, VIEW_W / 2, y + 64, 46, PALETTE.text, 'center', 'top');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW_W / 2, y + 118 + i * 32, 20, PALETTE.muted, 'center', 'top');
    }
    text(prompt, VIEW_W / 2, y + height - 26, 22, PALETTE.mission, 'center', 'bottom');
  }

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0c0e16';
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Camera follows the player, clamped to the world.
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    view.camX = Math.max(0, Math.min(WORLD.width - VIEW_W, px - VIEW_W / 2));
    view.camY = Math.max(0, Math.min(WORLD.height - VIEW_H, py - VIEW_H / 2));
    context.setTransform(view.scale, 0, 0, view.scale, view.x - view.camX * view.scale, view.y - view.camY * view.scale);
    drawWorld(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLMAR CITY', [
        'An open-world crime story in a sun-soaked city of your own.',
        'Steal cars, outrun the police, run five missions for Rico.',
        'WASD move / drive  •  E enter car  •  Space shoot  •  G save  •  L load',
        best > 0 ? `Best cash yet: $${best}` : '',
      ], 'Press Space or click to start');
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', [`Cash $${state.cash}  •  Mission ${state.missionIndex + 1} of 5`, 'Progress saves automatically after each mission.', 'Press G to save now.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('BUSTED', [`The Solmar police caught Mara. Cash kept: $${state.cash}`, `Missions done: ${state.stats.missions} of 5`], 'Press Space to play again');
    } else if (screen === SCREEN_WIN) {
      drawPanel('STORY COMPLETE', ['Mara pulled the Solmar Job and walked away clean.', `Final cash: $${state.cash}  •  Free roam continues.`, ''], 'Press Space to keep playing');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
