// Minimal ambient declarations for circomlibjs (which ships no types).
// We intentionally type the surface loosely and contain all field-element juggling
// inside ShadowCrypto.
declare module "circomlibjs" {
  export function buildEddsa(): Promise<any>;
  export function buildPoseidon(): Promise<any>;
}
