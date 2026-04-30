import { hashSeed } from "./hash-seed.js";
export function pickSeededValue(seed, values) {
    if (values.length === 0) {
        throw new Error("pickSeededValue requires at least one value.");
    }
    return values[hashSeed(seed) % values.length];
}
