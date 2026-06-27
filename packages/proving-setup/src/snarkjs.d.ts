// Minimal ambient typings for the parts of `snarkjs` used by this package.
// `snarkjs` ships no type declarations of its own, and the package's strict
// `verbatimModuleSyntax` / NodeNext config rejects an untyped import.
declare module "snarkjs" {
  export interface SnarkGroth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }

  export namespace groth16 {
    /**
     * Calculate the witness and generate a Groth16 proof in one step.
     * `wasmPath` / `zkeyPath` are filesystem paths to the compiled circuit
     * wasm and the proving key respectively.
     */
    function fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: SnarkGroth16Proof; publicSignals: string[] }>;

    function verify(
      vKey: unknown,
      publicSignals: string[],
      proof: SnarkGroth16Proof,
    ): Promise<boolean>;
  }
}
