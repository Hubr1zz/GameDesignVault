import type { RandomSource } from "./types";

export class SeededRandom implements RandomSource {
  private value: number;

  constructor(seed = 0x5f3759df) {
    this.value = seed >>> 0;
  }

  next() {
    this.value += 0x6d2b79f5;
    let t = this.value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  shuffle<T>(items: readonly T[]) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  pick<T>(items: readonly T[]) {
    if (!items.length) throw new Error("Cannot pick from an empty collection");
    return items[Math.floor(this.next() * items.length)];
  }
}
