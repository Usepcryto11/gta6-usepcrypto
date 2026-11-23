// The game's rules and state, with no drawing and no browser in it: the player
// on foot and in cars, traffic and pedestrians, police and the wanted level,
// combat, pickups, the five story missions, and saving. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound.
import { CAR, MISSIONS, PALETTE, PLAYER, SAVE_KEY, WANTED_MAX, WORLD } from './config.js';
import { buildCity, hitsBuilding, routeTo } from './city.js';
import { createRandom } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OVER = 4;
export const EVENT_MISSION = 8;
export const EVENT_SHOT = 16;
export const EVENT_CRASH = 32;
export const EVENT_STEAL = 64;
export const EVENT_FAIL = 128;

const GARAGE = { x: 450, y: 750 };
const HIDEOUT = { x: 450, y: 2050 };
const BANK = { x: 2350, y: 250 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random, seed) {
  const city = buildCity(random);
  const state = {
    city,
    player: { x: 1500, y: 1250, angle: 0, health: PLAYER.health, inCar: null, ammo: 24, punchCd: 0, hurtCd: 0 },
    cars: [],
    peds: [],
    bullets: [],
    pickups: [],
    cash: 0,
    wanted: 0,
    wantedTimer: 0,
    missionIndex: 0,
    missionPhase: 0,
    missionTimer: 0,
    missionTarget: null,
    elapsed: 0,
    time: 0,
    message: '',
    messageTimer: 0,
    dialogue: [],
    busted: false,
    storyDone: false,
    stats: { stolen: 0, missions: 0, shots: 0 },
    spawnTimer: 0,
    pickupTimer: 0,
  };

  function say(text, seconds) {
    state.message = text;
    state.messageTimer = seconds || 3;
  }
  function talk(lines) {
    state.dialogue = lines.slice();
  }

  function spawnCar(kind, x, y, angle) {
    const color = kind === 'police' ? PALETTE.police
      : kind === 'player' ? PALETTE.playerCar
      : PALETTE.traffic[Math.floor(random() * PALETTE.traffic.length)];
    const car = { x, y, angle, speed: 0, color, kind, target: null, route: [], routeIdx: 0, hp: 100, hitCd: 0 };
    state.cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    state.peds.push({
      x, y, angle: random() * Math.PI * 2, speed: 40 + random() * 40,
      color: PALETTE.ped[Math.floor(random() * PALETTE.ped.length)],
      target: null, flee: 0, down: 0, hitCd: 0,
    });
  }

  function randomRoadPoint() {
    const vertical = random() < 0.5;
    if (vertical) {
      const rx = [250, 750, 1250, 1750, 2250, 2750][Math.floor(random() * 6)];
      return { x: rx + (random() < 0.5 ? -18 : 18), y: 100 + random() * 2000 };
    }
    const ry = [250, 750, 1250, 1750, 2050][Math.floor(random() * 5)];
    return { x: 100 + random() * 2900, y: ry + (random() < 0.5 ? -18 : 18) };
  }

  function placePickups() {
    state.pickups = [];
    for (let i = 0; i < 10; i += 1) {
      const p = randomRoadPoint();
      state.pickups.push({ x: p.x, y: p.y, kind: 'cash', amount: 25 });
    }
    for (const [kind, n] of [['health', 4], ['ammo', 4]]) {
      for (let i = 0; i < n; i += 1) {
        const p = randomRoadPoint();
        state.pickups.push({ x: p.x, y: p.y, kind, amount: kind === 'health' ? 40 : 12 });
      }
    }
  }

  function missionTarget() {
    const m = MISSIONS[state.missionIndex];
    if (!m) return null;
    if (state.missionIndex === 1 && state.missionPhase === 1) return { ...GARAGE, name: 'Garage' };
    if (state.missionIndex === 4 && state.missionPhase === 1) return { ...HIDEOUT, name: 'Hideout' };
    return { ...m.target, name: m.targetName };
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionPhase = 0;
    const m = MISSIONS[index];
    if (!m) { state.missionTarget = null; return; }
    state.missionTimer = m.timeLimit || 0;
    if (m.wanted) state.wanted = Math.max(state.wanted, m.wanted);
    state.missionTarget = missionTarget();
    talk(m.brief);
    say(`Mission: ${m.title} — ${m.targetName}`);
  }

  function completeMission() {
    const m = MISSIONS[state.missionIndex];
    state.cash += m.reward;
    state.stats.missions += 1;
    say(`Mission complete: ${m.title}  +$${m.reward}`, 4);
    if (state.missionIndex + 1 >= MISSIONS.length) {
      state.storyDone = true;
      state.missionTarget = null;
      talk(['Rico: That is the whole job, Mara. Solmar is yours now.', 'Free roam: keep driving, keep the cash coming.']);
      return EVENT_MISSION;
    }
    startMission(state.missionIndex + 1);
    return EVENT_MISSION;
  }

  function failMission(reason) {
    say(`Mission failed: ${reason}. Try again.`, 4);
    state.wanted = 0;
    startMission(state.missionIndex);
    return EVENT_FAIL;
  }

  function raiseWanted(n) {
    if (state.wanted >= WANTED_MAX) return;
    state.wanted = Math.min(WANTED_MAX, state.wanted + n);
    state.wantedTimer = 0;
  }

  function reset() {
    // Rewind the RNG so every reset deals the same traffic, pedestrians and
    // pickups for a seed: the screenshot scenes then match a simulated run
    // of the same seed exactly, and restarting after being busted is fair.
    if (seed !== undefined) random = createRandom(seed);
    state.player.x = 1500;
    state.player.y = 1250;
    state.player.angle = 0;
    state.player.health = PLAYER.health;
    state.player.inCar = null;
    state.player.ammo = 24;
    state.cash = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.elapsed = 0;
    state.busted = false;
    state.storyDone = false;
    state.stats = { stolen: 0, missions: 0, shots: 0 };
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.message = '';
    state.dialogue = [];
    // A starter car parked by the player, traffic on the roads, parked cars to steal.
    const starter = spawnCar('player', 1560, 1250, 0);
    starter.speed = 0;
    for (let i = 0; i < 12; i += 1) {
      const p = randomRoadPoint();
      const c = spawnCar('traffic', p.x, p.y, random() < 0.5 ? 0 : Math.PI / 2);
      c.speed = 140 + random() * 80;
      c.target = randomRoadPoint();
    }
    for (let i = 0; i < 8; i += 1) {
      const p = randomRoadPoint();
      spawnCar('parked', p.x, p.y, random() < 0.5 ? 0 : Math.PI / 2);
    }
    // The marina sports car for mission 2, parked at the roadside by the marina.
    const sports = spawnCar('parked', 1290, 350, Math.PI / 2);
    sports.color = '#e5202e';
    sports.sports = true;
    for (let i = 0; i < 26; i += 1) {
      spawnPed(300 + random() * 2600, 300 + random() * 1800);
    }
    placePickups();
    startMission(0);
  }

  function policeCount() {
    let n = 0;
    for (const c of state.cars) if (c.kind === 'police') n += 1;
    return n;
  }

  function ensurePolice() {
    const want = state.wanted === 0 ? 0 : state.wanted;
    while (policeCount() < want) {
      const a = random() * Math.PI * 2;
      const px = clamp(state.player.x + Math.cos(a) * 700, 100, WORLD.width - 100);
      const py = clamp(state.player.y + Math.sin(a) * 700, 100, WORLD.height - 100);
      const c = spawnCar('police', px, py, angleTo(px, py, state.player.x, state.player.y));
      c.speed = 200;
    }
    // Extra police leave when the heat drops.
    if (policeCount() > want) {
      for (const c of state.cars) {
        if (c.kind === 'police' && policeCount() > want) c.gone = true;
      }
      state.cars = state.cars.filter((c) => !c.gone);
    }
  }

  function moveCircle(x, y, r, dx, dy) {
    // Move one axis at a time so buildings slide instead of sticking.
    let nx = x + dx;
    if (!hitsBuilding(state.city, nx, y, r) && nx > r && nx < WORLD.width - r && !(nyWater(nx, y))) nx = nx;
    else nx = x;
    let ny = y + dy;
    if (!hitsBuilding(state.city, nx, ny, r) && ny > r && ny < WORLD.height - r && !(nyWater(nx, ny))) ny = ny;
    else ny = y;
    return { x: nx, y: ny };
  }
  function nyWater(x, y) { return y > 2290; }

  function stepPlayer(dt, input, harmless) {
    const p = state.player;
    if (p.hurtCd > 0) p.hurtCd -= dt;
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.inCar) return 0;
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const moved = moveCircle(p.x, p.y, PLAYER.radius, input.move.x * speed * dt, input.move.y * speed * dt);
    p.x = moved.x;
    p.y = moved.y;
    if (input.move.x !== 0 || input.move.y !== 0) p.angle = Math.atan2(input.move.y, input.move.x);
    // Pickups.
    let events = 0;
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        if (pk.kind === 'cash') { state.cash += pk.amount; say(`+$${pk.amount}`); }
        else if (pk.kind === 'health') { p.health = Math.min(PLAYER.health, p.health + pk.amount); say(`Health +${pk.amount}`); }
        else { p.ammo += pk.amount; say(`Ammo +${pk.amount}`); }
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function stepCar(dt, car, input, isPlayer) {
    if (isPlayer) {
      const throttle = input.throttle || 0;
      const steer = input.steer || 0;
      // Throttle is analog (-1..1): a gentle throttle really is gentle.
      if (throttle > 0) car.speed += CAR.accel * throttle * dt;
      else if (throttle < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * (-throttle) * dt;
      else car.speed -= car.speed * CAR.drag * dt;
      car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
      if (Math.abs(car.speed) > 5) {
        // Keep some steering even at a crawl, or a car that stops against a
        // wall can never turn away from it.
        const turnFactor = 0.35 + 0.65 * Math.min(1, Math.abs(car.speed) / 200);
        car.angle += steer * CAR.turn * dt * (car.speed > 0 ? 1 : -1) * turnFactor;
      } else if (steer !== 0) {
        car.angle += steer * CAR.turn * dt * 0.35;
      }
    } else if (car.kind === 'police') {
      if (car.disabled > 0) {
        // Shot up: sits dark until it recovers.
        car.disabled -= dt;
        car.speed = Math.max(0, car.speed - 400 * dt);
        const nx0 = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny0 = car.y + Math.sin(car.angle) * car.speed * dt;
        if (!hitsBuilding(state.city, nx0, ny0, 12)) { car.x = nx0; car.y = ny0; }
        if (car.hitCd > 0) car.hitCd -= dt;
        return 0;
      }
      // Chase the player, on foot or in a car.
      const target = state.player.inCar || state.player;
      const want = angleTo(car.x, car.y, target.x, target.y);
      car.angle += clamp(angleDiff(car.angle, want), -2.4 * dt, 2.4 * dt);
      car.speed = Math.min(car.speed + 260 * dt, 480);
    } else if (car.kind === 'traffic') {
      if (!car.target || dist(car.x, car.y, car.target.x, car.target.y) < 40) {
        car.target = randomRoadPoint();
      }
      const want = angleTo(car.x, car.y, car.target.x, car.target.y);
      car.angle += clamp(angleDiff(car.angle, want), -1.8 * dt, 1.8 * dt);
      car.speed = 150 + Math.sin(state.time * 0.5 + car.x) * 20;
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    let events = 0;
    // Collide at the front and rear bumpers with small circles, not one fat
    // centre circle: a car can slide along a sidewalk without wedging on a
    // building's corner, but still cannot drive through a building. A bumper
    // only blocks when the car is moving toward the building it touches, so
    // a car pressed parallel to a wall can slide along it.
    const vx = nx - car.x;
    const vy = ny - car.y;
    const vlen = Math.hypot(vx, vy) || 1;
    let hit = false;
    for (const [px, py] of [
      [nx + Math.cos(car.angle) * 20, ny + Math.sin(car.angle) * 20],
      [nx - Math.cos(car.angle) * 20, ny - Math.sin(car.angle) * 20],
    ]) {
      const b = hitsBuilding(state.city, px, py, 12);
      if (!b) continue;
      const qx = Math.max(b.x, Math.min(px, b.x + b.w));
      const qy = Math.max(b.y, Math.min(py, b.y + b.h));
      const dx = qx - px;
      const dy = qy - py;
      const d = Math.hypot(dx, dy) || 1;
      if ((vx * dx + vy * dy) / vlen / d > 0.3) { hit = true; break; }
    }
    if (hit || nx < 30 || nx > WORLD.width - 30 || ny < 30 || ny > 2260) {
      if (isPlayer && Math.abs(car.speed) > 200) events |= EVENT_CRASH;
      car.speed *= -0.25;
    } else {
      car.x = nx;
      car.y = ny;
    }
    if (car.hitCd > 0) car.hitCd -= dt;
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind === 'traffic' || car.kind === 'police') stepCar(dt, car, null, false);
    }
    // Car-car bumps: push apart, slow both down. Parked cars do not move.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 56 && d > 0.01) {
          const push = (56 - d) / 2;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          if (a.kind !== 'parked') { a.x -= ux * push; a.y -= uy * push; a.speed *= 0.7; }
          if (b.kind !== 'parked') { b.x += ux * push; b.y += uy * push; b.speed *= 0.7; }
          if (a.kind === 'parked' || b.kind === 'parked') {
            // The moving car takes the whole push instead.
            const mover = a.kind === 'parked' ? b : a;
            mover.x += (mover === b ? ux : -ux) * push;
            mover.y += (mover === b ? uy : -uy) * push;
          }
          // Bumps never push a car out of the world.
          for (const c of [a, b]) {
            c.x = clamp(c.x, 30, WORLD.width - 30);
            c.y = clamp(c.y, 30, 2260);
          }
        }
      }
    }
  }

  function stepPeds(dt, harmless) {
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      // Flee from gunfire, police chases and speeding cars.
      const player = state.player;
      const px = player.inCar ? player.inCar.x : player.x;
      const py = player.inCar ? player.inCar.y : player.y;
      const dPlayer = dist(ped.x, ped.y, px, py);
      if ((state.wanted > 0 && dPlayer < 260) || (player.inCar && Math.abs(player.inCar.speed) > 300 && dPlayer < 200)) {
        ped.flee = 1.5;
        ped.angle = angleTo(px, py, ped.x, ped.y);
      }
      if (ped.flee > 0) ped.flee = Math.max(0, ped.flee - dt);
      if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 30) {
        ped.target = randomRoadPoint();
      }
      const want = ped.flee > 0 ? ped.angle : angleTo(ped.x, ped.y, ped.target.x, ped.target.y);
      ped.angle += clamp(angleDiff(ped.angle, want), -3 * dt, 3 * dt);
      const speed = ped.flee > 0 ? ped.speed * 2.2 : ped.speed;
      const nx = ped.x + Math.cos(ped.angle) * speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * speed * dt;
      if (!hitsBuilding(state.city, nx, ny, 10) && nx > 20 && nx < WORLD.width - 20 && ny > 20 && ny < 2270) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.angle += Math.PI / 2;
      }
      // Run over by a car.
      for (const car of state.cars) {
        if (car.kind === 'parked') continue;
        if (Math.abs(car.speed) > 60 && dist(ped.x, ped.y, car.x, car.y) < 34) {
          ped.down = 4;
          if (!harmless && car === state.player.inCar) {
            raiseWanted(1);
            say('You hit a pedestrian! Wanted up.');
          }
        }
      }
    }
  }

  function stepBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > WORLD.width || b.y < 0 || b.y > WORLD.height) { b.dead = true; continue; }
      if (hitsBuilding(state.city, b.x, b.y, 2)) { b.dead = true; continue; }
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          ped.down = 5;
          b.dead = true;
          raiseWanted(1);
        }
      }
      for (const car of state.cars) {
        if (car === state.player.inCar) continue;
        if (dist(b.x, b.y, car.x, car.y) < 30) {
          car.hp -= 34;
          b.dead = true;
          if (car.kind === 'police') raiseWanted(1);
          if (car.hp <= 0) {
            // A shot-up car is disabled for a while, not just slowed: police
            // cars sit dark for 8 s, traffic cars give up and park.
            car.hp = 100;
            car.speed = 0;
            if (car.kind === 'police') car.disabled = 8;
            else car.kind = 'parked';
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => !b.dead);
  }

  function stepPolice(dt, harmless) {
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      const d = dist(car.x, car.y, px, py);
      if (d < 60 && car.hitCd <= 0 && p.hurtCd <= 0) {
        car.hitCd = 2.5;
        p.hurtCd = 1;
        // The police car bounces off after the ram instead of staying glued
        // to the player, so a rammed player can still drive away.
        car.speed = -120;
        if (p.inCar) {
          p.health -= 3;
        } else {
          p.health -= 10;
          say('The police are on you!');
        }
      }
      // On foot, a close police car busts you if you are hurt and cornered.
      if (!p.inCar && d < 46 && p.health <= 25) {
        p.health = 0;
      }
    }
    // Wanted decays when no police are near.
    let nearest = Infinity;
    for (const car of state.cars) if (car.kind === 'police') nearest = Math.min(nearest, dist(car.x, car.y, px, py));
    if (state.wanted > 0 && nearest > 500) {
      state.wantedTimer += dt;
      if (state.wantedTimer > 5) {
        state.wanted -= 1;
        state.wantedTimer = 0;
        say(state.wanted === 0 ? 'You lost the cops.' : 'Heat is cooling off.');
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  function tryEnterCar() {
    const p = state.player;
    if (p.inCar) {
      const car = p.inCar;
      // Step out on a clear side of the car, never inside a building.
      let placed = false;
      for (const off of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
        const ex = car.x + Math.cos(car.angle + off) * 44;
        const ey = car.y + Math.sin(car.angle + off) * 44;
        if (!hitsBuilding(state.city, ex, ey, 14) && ex > 20 && ex < WORLD.width - 20 && ey > 20 && ey < 2270) {
          p.x = ex;
          p.y = ey;
          placed = true;
          break;
        }
      }
      if (!placed) {
        p.x = car.x + 44;
        p.y = car.y;
      }
      p.inCar = null;
      car.kind = 'parked';
      car.speed = 0;
      say('You got out of the car.');
      return 0;
    }
    let best = null;
    let bestD = 80;
    for (const car of state.cars) {
      if (car.kind === 'police') continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return 0;
    const ownCar = best.kind === 'player';
    p.inCar = best;
    best.kind = 'player';
    best.speed = 0;
    state.stats.stolen += 1;
    if (best.sports) say('You took the sports car! Get it to the garage.');
    else if (!ownCar) say('You took the car. The owner will not be pleased.');
    // Taking your own car is not a crime; stealing a stranger's is.
    if (!ownCar) raiseWanted(1);
    return EVENT_STEAL;
  }

  function tryAttack(input) {
    const p = state.player;
    if (p.inCar || p.punchCd > 0) return 0;
    p.punchCd = 0.35;
    const aim = input.aimAngle != null ? input.aimAngle : p.angle;
    if (p.ammo > 0) {
      p.ammo -= 1;
      state.stats.shots += 1;
      state.bullets.push({ x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20, vx: Math.cos(aim) * 900, vy: Math.sin(aim) * 900, life: 1.2 });
      return EVENT_SHOT;
    }
    // No ammo: punch in front of you.
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      if (dist(p.x, p.y, ped.x, ped.y) < 52 && Math.abs(angleDiff(p.angle, aim)) < 1.2) ped.down = 3;
    }
    return EVENT_SHOT;
  }

  function checkMission(dt) {
    if (state.storyDone || !state.missionTarget) return 0;
    const m = MISSIONS[state.missionIndex];
    if (m.timeLimit) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) return failMission('Out of time');
    }
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    const t = state.missionTarget;
    if (dist(px, py, t.x, t.y) > 110) return 0;
    if (state.missionIndex === 1 && state.missionPhase === 0) {
      // Reached the marina: the job is to steal the sports car, then deliver it.
      if (!p.inCar || !p.inCar.sports) {
        say('That is the car. Press E to take it.');
        return 0;
      }
      state.missionPhase = 1;
      state.missionTarget = missionTarget();
      say('Now bring it to the garage in Old Town.');
      return 0;
    }
    if (state.missionIndex === 2 && state.missionPhase === 0) {
      if (state.wanted > 0) {
        say('Still wanted. Lose the cops first.');
        return 0;
      }
      return completeMission();
    }
    if (state.missionIndex === 4 && state.missionPhase === 0) {
      state.cash += 500;
      state.missionPhase = 1;
      state.missionTarget = missionTarget();
      raiseWanted(2);
      say('You grabbed the cash! Get to the hideout, fast.');
      return 0;
    }
    return completeMission();
  }

  /**
   * One fixed step. `input` is { move, steer, throttle, run, enter, attack,
   * aimAngle } (missing fields are treated as off). With `harmless` set (the
   * title screen's backdrop) the city moves but nothing hurts the player and
   * nothing scores.
   */
  function step(dt, input, harmless) {
    const inp = input || {};
    let events = 0;
    state.elapsed += dt;
    state.time += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.dialogue.length > 0 && state.messageTimer <= 0) {
      say(state.dialogue.shift(), 3.5);
    }
    if (state.busted) return EVENT_OVER;

    if (inp.enter) events |= tryEnterCar();
    if (inp.attack) events |= tryAttack(inp);

    events |= stepPlayer(dt, inp, harmless);
    if (state.player.inCar) events |= stepCar(dt, state.player.inCar, inp, true);
    stepTraffic(dt);
    stepPeds(dt, harmless);
    stepBullets(dt);
    if (!harmless) {
      ensurePolice();
      stepPolice(dt, harmless);
      // Out of trouble, Mara patches up slowly.
      if (state.wanted === 0 && state.player.health < PLAYER.health) {
        state.player.health = Math.min(PLAYER.health, state.player.health + 1.5 * dt);
      }
      events |= checkMission(dt);
    }

    // Respawn pickups and pedestrians so the city stays alive.
    state.pickupTimer -= dt;    if (state.pickupTimer <= 0) {
      state.pickupTimer = 20;
      for (const pk of state.pickups) if (pk.taken && random() < 0.3) pk.taken = false;
      if (state.peds.length < 30) spawnPed(300 + random() * 2600, 300 + random() * 1800);
    }

    if (state.player.health <= 0 && !harmless) {
      state.busted = true;
      events |= EVENT_OVER;
    }
    return events;
  }

  /** Autopilot input for screenshot scenes: drive toward the mission target. */
  function driveInput() {
    const p = state.player;
    const t = state.missionTarget || { x: 1500, y: 1250 };
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    // Mission 3 ("Heat"): while wanted, run from the nearest police car at
    // full speed instead of toward the hideout — the heat has to drop first.
    if (state.missionIndex === 2 && state.wanted > 0) {
      let nearest = null;
      let nearestD = Infinity;
      for (const car of state.cars) {
        if (car.kind !== 'police') continue;
        const d = dist(px, py, car.x, car.y);
        if (d < nearestD) { nearestD = d; nearest = car; }
      }
      if (nearest) {
        // Flee along a road (the city grid is axis-aligned): score the four
        // cardinal directions by how far from the police they take you, and
        // take the best — a straight line away runs into a building.
        // Score against the whole pack, not just the nearest car, and
        // penalise a direction the map edge eats: at the edge, "away" is a
        // dead end the police pin you against.
        const police = state.cars.filter((c) => c.kind === 'police');
        let bestAngle = 0;
        let bestScore = -Infinity;
        for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const nx = clamp(px + Math.cos(a) * 500, 60, WORLD.width - 60);
          const ny = clamp(py + Math.sin(a) * 500, 60, 2260);
          const travelled = dist(px, py, nx, ny);
          let closest = Infinity;
          for (const pc of police) closest = Math.min(closest, dist(nx, ny, pc.x, pc.y));
          const score = closest - 2 * (500 - travelled);
          if (score > bestScore) { bestScore = score; bestAngle = a; }
        }
        if (!p.inCar) return { move: { x: Math.cos(bestAngle), y: Math.sin(bestAngle) }, run: true };
        const car = p.inCar;
        return { move: { x: 0, y: 0 }, steer: clamp(angleDiff(car.angle, bestAngle) * 2, -1, 1), throttle: 1 };
      }
    }
    // Keep one route until the target changes: recomputing it every step flips
    // the next waypoint as the car passes intersections and it oscillates.
    const key = `${t.x},${t.y}`;
    if (state.pilotKey !== key || !state.pilotRoute) {
      state.pilotKey = key;
      state.pilotRoute = routeTo(px, py, t.x, t.y);
      state.pilotIdx = 1;
    }
    const route = state.pilotRoute;
    while (state.pilotIdx < route.length - 1 && dist(px, py, route[state.pilotIdx].x, route[state.pilotIdx].y) < 110) {
      state.pilotIdx += 1;
    }
    const wp = route[Math.min(state.pilotIdx, route.length - 1)];
    const wpDist = dist(px, py, wp.x, wp.y);
    const want = angleTo(px, py, wp.x, wp.y);
    if (!p.inCar) {
      // Mission 2: walk to the sports car itself, not just any car.
      if (state.missionIndex === 1 && state.missionPhase === 0) {
        if (dist(px, py, t.x, t.y) < 70) return { move: { x: 0, y: 0 }, enter: true };
        const a = angleTo(px, py, t.x, t.y);
        return { move: { x: Math.cos(a), y: Math.sin(a) }, run: true };
      }
      // Walk toward the nearest car first.
      let best = null;
      let bestD = Infinity;
      for (const car of state.cars) {
        if (car.kind === 'police') continue;
        const d = dist(px, py, car.x, car.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best && bestD < 70) return { move: { x: 0, y: 0 }, enter: true };
      const a = best ? angleTo(px, py, best.x, best.y) : want;
      return { move: { x: Math.cos(a), y: Math.sin(a) }, run: true };
    }
    // Mission 2: get out once you have driven to the marina.
    if (state.missionIndex === 1 && state.missionPhase === 0 && dist(px, py, t.x, t.y) < 140) {
      return { move: { x: 0, y: 0 }, enter: true };
    }
    const car = p.inCar;
    const turnAmount = angleDiff(car.angle, want);
    const steer = clamp(turnAmount * 2, -1, 1);
    // Slow down for a sharp turn, and brake first if you are flying at it:
    // at full speed the car swings wide off the road and wedges on a building.
    // A U-turn is done stopped: brake, turn in place, then drive.
    // (Throttle is analog: 0.25 really is a gentle throttle.)
    let throttle = 1;
    if (Math.abs(turnAmount) > 1.4) throttle = Math.abs(car.speed) > 60 ? -1 : 0;
    else if (Math.abs(turnAmount) > 0.5) throttle = Math.abs(car.speed) > 80 ? -1 : 0.25;
    else if (Math.abs(turnAmount) > 0.2) throttle = Math.abs(car.speed) > 300 ? -0.5 : 1;
    // Do not fly past a near waypoint: slow down as you approach it, or the
    // turn after it is taken from the wrong side of the road at full speed.
    // In a chase, though, speed is survival: never cap it while wanted.
    if (state.wanted === 0) {
      if (wpDist < 200) throttle = Math.min(throttle, 0.2);
      else if (wpDist < 450) throttle = Math.min(throttle, 0.5);
    }
    // If the straight line to the waypoint cuts through a building (the car
    // got pushed off its road during a turn), reroute from here: the fresh
    // route starts at the nearest intersection.
    if (state.time - (state.pilotRecheck || 0) > 2) {
      state.pilotRecheck = state.time;
      const dx = wp.x - px;
      const dy = wp.y - py;
      const len = Math.hypot(dx, dy);
      let blocked = false;
      for (let s = 40; s < len; s += 40) {
        if (hitsBuilding(state.city, px + (dx * s) / len, py + (dy * s) / len, 10)) { blocked = true; break; }
      }
      if (blocked) {
        state.pilotKey = null;
        state.pilotRoute = routeTo(px, py, t.x, t.y);
        state.pilotKey = key;
        state.pilotIdx = 1;
      }
    }
    // Stuck is measured by movement, not speed: a car bumping a wall can
    // briefly exceed 40 and reset a speed-based timer forever. If the car has
    // not moved 30 units in 2 seconds, back up for 1.5 seconds, steering the
    // other way, then retry.
    if (state.pilotLastX == null) {
      state.pilotLastX = px;
      state.pilotLastY = py;
      state.pilotStuckSince = 0;
    }
    const moved = Math.hypot(px - state.pilotLastX, py - state.pilotLastY);
    if (moved > 30) {
      state.pilotLastX = px;
      state.pilotLastY = py;
      state.pilotStuckSince = 0;
    } else if (!state.pilotStuckSince) {
      state.pilotStuckSince = state.time;
    }
    if (state.pilotReverseUntil && state.time < state.pilotReverseUntil) {
      return { move: { x: 0, y: 0 }, steer: -steer, throttle: -0.7 };
    }
    if (state.pilotStuckSince && state.time - state.pilotStuckSince > 2) {
      state.pilotReverseUntil = state.time + 1.5;
      state.pilotStuckSince = 0;
      state.pilotLastX = px;
      state.pilotLastY = py;
      return { move: { x: 0, y: 0 }, steer: -steer, throttle: -0.7 };
    }
    return { move: { x: 0, y: 0 }, steer, throttle };
  }

  function save() {
    try {
      const p = state.player;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, missionIndex: state.missionIndex, health: p.health,
        x: p.x, y: p.y, ammo: p.ammo, wanted: state.wanted,
        elapsed: state.elapsed, storyDone: state.storyDone,
      }));
      return true;
    } catch { return false; }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      state.cash = d.cash || 0;
      state.player.health = d.health || PLAYER.health;
      state.player.x = clamp(d.x || 1500, 50, WORLD.width - 50);
      state.player.y = clamp(d.y || 1250, 50, WORLD.height - 50);
      state.player.ammo = d.ammo || 0;
      state.wanted = d.wanted || 0;
      state.elapsed = d.elapsed || 0;
      state.storyDone = !!d.storyDone;
      startMission(Math.min(d.missionIndex || 0, MISSIONS.length - 1));
      return true;
    } catch { return false; }
  }

  function districtAt(x, y) {
    for (const d of [{ name: 'Old Town', x: 0, y: 0, w: 1000, h: 1000 }]) void d;
    return null;
  }

  reset();
  return {
    state, reset, step, save, load, driveInput, startMission, say,
    missionName() {
      const m = MISSIONS[state.missionIndex];
      return m ? m.title : 'Free roam';
    },
    districtAt,
  };
}
