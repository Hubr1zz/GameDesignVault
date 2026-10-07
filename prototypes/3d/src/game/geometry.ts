import type { HexPosition } from "./types";

export const HEX_DIRECTIONS: HexPosition[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

export const keyOf = (p: HexPosition) => `${p.q},${p.r}`;
export const sameHex = (a: HexPosition, b: HexPosition) => a.q === b.q && a.r === b.r;
export const hexDistance = (a: HexPosition, b: HexPosition) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((a.q + a.r) - (b.q + b.r))) / 2;
export const isInside = (p: HexPosition, radius: number) =>
  Math.max(Math.abs(p.q), Math.abs(p.r), Math.abs(p.q + p.r)) <= radius;
export const neighbors = (p: HexPosition) => HEX_DIRECTIONS.map((d) => ({ q: p.q + d.q, r: p.r + d.r }));

export function cells(radius: number) {
  const result: HexPosition[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minR = Math.max(-radius, -q - radius);
    const maxR = Math.min(radius, -q + radius);
    for (let r = minR; r <= maxR; r += 1) result.push({ q, r });
  }
  return result;
}

export function shortestStep(from: HexPosition, to: HexPosition, blocked: Set<string>, radius: number) {
  const options = neighbors(from)
    .filter((p) => isInside(p, radius) && !blocked.has(keyOf(p)))
    .sort((a, b) => hexDistance(a, to) - hexDistance(b, to));
  return options[0] ?? from;
}

export function reachableCells(from: HexPosition, maxSteps: number, blocked: Set<string>, radius: number) {
  const reached = new Map<string, HexPosition>([[keyOf(from), { ...from }]]);
  let frontier: HexPosition[] = [{ ...from }];
  for (let step = 0; step < maxSteps; step += 1) {
    const next: HexPosition[] = [];
    frontier.forEach((current) => neighbors(current).forEach((candidate) => {
      const key = keyOf(candidate);
      if (!isInside(candidate, radius) || blocked.has(key) || reached.has(key)) return;
      reached.set(key, candidate);
      next.push(candidate);
    }));
    frontier = next;
  }
  return [...reached.values()];
}

export function compliantEndpoint(from: HexPosition, target: HexPosition, move: number, range: number, blocked: Set<string>, radius: number) {
  let current = { ...from };
  for (let i = 0; i < move && hexDistance(current, target) > range; i += 1) {
    const next = shortestStep(current, target, blocked, radius);
    if (sameHex(next, current)) break;
    current = next;
  }
  return current;
}

export function axialToWorld(p: HexPosition, size = 1.18): [number, number, number] {
  return [size * Math.sqrt(3) * (p.q + p.r / 2), 0, size * 1.5 * p.r];
}

export function facingToWorldAngle(facing: number) {
  const safeFacing = Number.isFinite(facing) ? Math.trunc(facing) : 0;
  const index = ((safeFacing % HEX_DIRECTIONS.length) + HEX_DIRECTIONS.length) % HEX_DIRECTIONS.length;
  const [x, , z] = axialToWorld(HEX_DIRECTIONS[index], 1);
  return Math.atan2(x, z);
}
