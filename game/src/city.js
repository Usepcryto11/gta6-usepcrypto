// The city of Solmar: a road grid, the blocks between the roads, the buildings
// and parks inside them, and the beach and water along the south edge. All of it
// is generated once from a seed, so the same seed always builds the same city.
// Roads run every 500 units; intersections are the nodes traffic drives between.
import { PALETTE, WORLD } from './config.js';

export const ROAD_W = 96;
export const ROAD_XS = [250, 750, 1250, 1750, 2250, 2750];
export const ROAD_YS = [250, 750, 1250, 1750, 2050];

function onRoad(x, y, margin) {
  for (const rx of ROAD_XS) if (Math.abs(x - rx) < ROAD_W / 2 + margin) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) < ROAD_W / 2 + margin) return true;
  return false;
}

export function buildCity(random) {
  const buildings = [];
  const parks = [];
  // Blocks are the rectangles between neighbouring roads.
  const xs = [0, ...ROAD_XS, WORLD.width];
  const ys = [0, ...ROAD_YS, WORLD.height];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      // A generous sidewalk margin keeps cars from wedging on building corners.
      const x0 = xs[bx] + ROAD_W / 2 + 30;
      const x1 = xs[bx + 1] - ROAD_W / 2 - 30;
      const y0 = ys[by] + ROAD_W / 2 + 30;
      const y1 = ys[by + 1] - ROAD_W / 2 - 30;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      // The strip below the last road is the beach; keep it clear of buildings.
      if (y0 > 2100) continue;
      if (random() < 0.22) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees: [] });
        const park = parks[parks.length - 1];
        const n = 4 + Math.floor(random() * 5);
        for (let i = 0; i < n; i += 1) {
          park.trees.push({ x: x0 + 30 + random() * (x1 - x0 - 60), y: y0 + 30 + random() * (y1 - y0 - 60), r: 12 + random() * 10 });
        }
        continue;
      }
      const cols = x1 - x0 > 260 ? 2 : 1;
      const rows = y1 - y0 > 260 ? 2 : 1;
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const bw = (x1 - x0) / cols - 24;
          const bh = (y1 - y0) / rows - 24;
          const bx0 = x0 + cx * ((x1 - x0) / cols) + 12;
          const by0 = y0 + cy * ((y1 - y0) / rows) + 12;
          const ci = Math.floor(random() * PALETTE.building.length);
          buildings.push({ x: bx0, y: by0, w: bw, h: bh, color: PALETTE.building[ci], roof: PALETTE.buildingRoof[ci], hgt: 1 + Math.floor(random() * 3) });
        }
      }
    }
  }
  return { buildings, parks, onRoad, roadsX: ROAD_XS, roadsY: ROAD_YS };
}

/** True when the circle at (x, y, r) touches a building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

/** Nearest intersection (road crossing) to a point — the node traffic routes through. */
export function nearestNode(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_XS) {
    for (const ry of ROAD_YS) {
      const d = (x - rx) * (x - rx) + (y - ry) * (y - ry);
      if (d < bestD) { bestD = d; best = { x: rx, y: ry }; }
    }
  }
  return best;
}

/**
 * A road route from (sx, sy) to (tx, ty): drive along the road you are already
 * on to the column/row nearest the target, then along that to the target's row/
 * column, then to the target. A car already on a road never has to U-turn to a
 * node behind it. Off the roads, go to the nearest intersection first.
 */
export function routeTo(sx, sy, tx, ty) {
  const pts = [{ x: sx, y: sy }];
  const closestX = ROAD_XS.reduce((a, b) => (Math.abs(b - tx) < Math.abs(a - tx) ? b : a));
  const closestY = ROAD_YS.reduce((a, b) => (Math.abs(b - ty) < Math.abs(a - ty) ? b : a));
  const nearY = ROAD_YS.reduce((a, b) => (Math.abs(b - sy) < Math.abs(a - sy) ? b : a));
  const nearX = ROAD_XS.reduce((a, b) => (Math.abs(b - sx) < Math.abs(a - sx) ? b : a));
  if (Math.abs(sy - nearY) < ROAD_W / 2) {
    // On a horizontal road: along it to the target's column, then down it.
    pts.push({ x: closestX, y: nearY });
    pts.push({ x: closestX, y: closestY });
  } else if (Math.abs(sx - nearX) < ROAD_W / 2) {
    // On a vertical road: along it to the target's row, then across it.
    pts.push({ x: nearX, y: closestY });
    pts.push({ x: closestX, y: closestY });
  } else {
    // Off-road: nearest intersection, then a Manhattan walk on the grid.
    const start = nearestNode(sx, sy);
    const end = nearestNode(tx, ty);
    pts.push({ x: start.x, y: start.y });
    let xi = ROAD_XS.indexOf(start.x);
    let yi = ROAD_YS.indexOf(start.y);
    const exi = ROAD_XS.indexOf(end.x);
    const eyi = ROAD_YS.indexOf(end.y);
    while (xi !== exi) {
      xi += xi < exi ? 1 : -1;
      pts.push({ x: ROAD_XS[xi], y: ROAD_YS[yi] });
    }
    while (yi !== eyi) {
      yi += yi < eyi ? 1 : -1;
      pts.push({ x: ROAD_XS[xi], y: ROAD_YS[yi] });
    }
  }
  pts.push({ x: tx, y: ty });
  return pts;
}
