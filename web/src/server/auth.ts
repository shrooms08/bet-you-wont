import "server-only";
import { PrivyClient } from "@privy-io/node";
import { getAddress, isAddress, type Address } from "viem";
import { serverEnv } from "./env";
import { ApiError } from "./http";

/**
 * Who is calling: the verified Privy user, every Ethereum wallet Privy says they have linked,
 * and the one wallet this request acts as.
 *
 * The acting wallet comes from the `X-Wallet-Address` header (or an explicit `requested` value).
 * It is accepted only if Privy lists it as linked to this user. With no header, a user with one
 * wallet acts as it, and a user with several acts as their embedded wallet.
 */
export type Caller = { userId: string; wallets: Address[]; wallet: Address; /** Privy account creation (ms), if known */ createdAt: number | null };

let privy: PrivyClient | null = null;
function privyClient(): PrivyClient {
  privy ??= new PrivyClient({ appId: serverEnv.privyAppId(), appSecret: serverEnv.privyAppSecret() });
  return privy;
}

type LinkedWallets = { all: Address[]; embedded: Address | null; createdAt: number | null; at: number };
const linkedCache = new Map<string, LinkedWallets>();
const LINKED_TTL_MS = 30_000;

async function linkedWallets(userId: string): Promise<LinkedWallets> {
  const hit = linkedCache.get(userId);
  if (hit && Date.now() - hit.at < LINKED_TTL_MS) return hit;
  let user;
  try {
    user = await privyClient().users()._get(userId);
  } catch {
    throw new ApiError(502, "Could not load your account from Privy. Try again.");
  }
  const all: Address[] = [];
  let embedded: Address | null = null;
  for (const a of user.linked_accounts) {
    if (a.type !== "wallet" || !("chain_type" in a) || a.chain_type !== "ethereum") continue;
    if (!("address" in a) || !isAddress(String(a.address))) continue;
    const addr = getAddress(String(a.address));
    all.push(addr);
    if ("connector_type" in a && a.connector_type === "embedded") embedded ??= addr;
  }
  // Privy sends created_at in seconds
  const created = Number((user as { created_at?: number }).created_at);
  const entry = { all, embedded, createdAt: Number.isFinite(created) && created > 0 ? created * 1000 : null, at: Date.now() };
  linkedCache.set(userId, entry);
  return entry;
}

/** Verifies `Authorization: Bearer <privy access token>`. Throws 401 if missing or invalid. */
export async function requireCaller(request: Request, requested?: string | null): Promise<Caller> {
  serverEnv.privyAppSecret(); // fail fast with the friendly 500 if the secret is not configured
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "Missing Authorization: Bearer <privy access token>.");

  let userId: string;
  try {
    userId = (await privyClient().utils().auth().verifyAccessToken(token)).user_id;
  } catch {
    throw new ApiError(401, "Invalid or expired Privy access token. Log in again.");
  }

  const linked = await linkedWallets(userId);
  if (linked.all.length === 0) throw new ApiError(403, "Your account has no Ethereum wallet yet.");

  const want = requested ?? request.headers.get("x-wallet-address");
  let wallet: Address;
  if (want) {
    if (!isAddress(want, { strict: false })) throw new ApiError(400, "X-Wallet-Address is not a valid address.");
    const match = linked.all.find((w) => w.toLowerCase() === want.toLowerCase());
    if (!match) throw new ApiError(403, "That wallet is not linked to your account.");
    wallet = match;
  } else if (linked.all.length === 1) {
    wallet = linked.all[0];
  } else if (linked.embedded) {
    wallet = linked.embedded;
  } else {
    throw new ApiError(400, "You have several wallets: send X-Wallet-Address to say which one.");
  }
  return { userId, wallets: linked.all, wallet, createdAt: linked.createdAt };
}

/** True if `address` is one of the caller's linked wallets. */
export function ownsWallet(caller: Caller, address: string | null | undefined): boolean {
  if (!address) return false;
  return caller.wallets.some((w) => w.toLowerCase() === address.toLowerCase());
}
