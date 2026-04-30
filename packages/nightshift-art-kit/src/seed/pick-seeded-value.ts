import { hashSeed } from "./hash-seed.js";

export function pickSeededValue<T>(seed: string, values: T[]) {
  if (values.length === 0) {
    throw new Error("pickSeededValue requires at least one value.");
  }

  return values[hashSeed(seed) % values.length] as T;
}
