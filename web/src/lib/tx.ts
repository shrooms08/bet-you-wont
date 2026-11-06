import type { Hex } from "viem";

/**
 * Progress of one user action. `phase` drives the toast copy:
 * prepare ("getting ready…"), confirm ("confirm in your wallet…"), sending ("sending…").
 */
export type TxState =
  | { status: "idle" }
  | { status: "working"; step: string; phase?: "prepare" | "confirm" | "sending"; hash?: Hex }
  | { status: "done"; hash?: Hex; message: string }
  | { status: "error"; message: string; hash?: Hex };

export const IDLE: TxState = { status: "idle" };
