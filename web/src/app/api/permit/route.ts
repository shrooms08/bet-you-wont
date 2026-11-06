import { PrivyClient } from "@privy-io/node";
import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain, escrowAbi, escrowAddress } from "@/lib/contracts";

// Runs on the default Node.js runtime (required by @privy-io/node and the signing key).
// POST handlers are never prerendered, so no segment config is needed (and cacheComponents forbids it).

const SECRET_PLACEHOLDER = "PASTE_PRIVY_APP_SECRET_HERE";
const PERMIT_TTL_SECONDS = 10 * 60;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const JOIN_PERMIT_TYPES = {
  JoinPermit: [
    { name: "groupId", type: "uint256" },
    { name: "account", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// In-memory, per-process rate limit: fine for local dev / a single instance (see report).
const issued = new Map<string, number[]>();

let privyClient: PrivyClient | null = null;
let signerChecked = false;

const publicClient = createPublicClient({ chain: activeChain, transport: http() });

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function getPrivy(appId: string, appSecret: string): PrivyClient {
  privyClient ??= new PrivyClient({ appId, appSecret });
  return privyClient;
}

function withinRateLimit(userId: string, now: number): boolean {
  const recent = (issued.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  issued.set(userId, recent);
  return recent.length < RATE_LIMIT;
}

export async function POST(request: Request) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  const signerKey = process.env.INVITE_SIGNER_PRIVATE_KEY;

  if (!appId) return json(500, { error: "NEXT_PUBLIC_PRIVY_APP_ID is not set on the server." });
  if (!appSecret || appSecret === SECRET_PLACEHOLDER) {
    return json(500, {
      error: "PRIVY_APP_SECRET is missing. Paste your Privy app secret into web/.env.local and restart the server.",
    });
  }
  if (!signerKey || !/^0x[0-9a-fA-F]{64}$/.test(signerKey)) {
    return json(500, { error: "INVITE_SIGNER_PRIVATE_KEY is missing or malformed in web/.env.local." });
  }

  // 1. Authenticate: verify the Privy access token server-side.
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return json(401, { error: "Missing Authorization: Bearer <privy access token>." });

  const privy = getPrivy(appId, appSecret);
  let userId: string;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    userId = claims.user_id;
  } catch {
    return json(401, { error: "Invalid or expired Privy access token." });
  }

  // 2. Validate input.
  let body: { groupId?: unknown; address?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Body must be JSON: { groupId, address }." });
  }
  const groupIdRaw = typeof body.groupId === "number" ? String(body.groupId) : body.groupId;
  if (typeof groupIdRaw !== "string" || !/^[1-9][0-9]{0,18}$/.test(groupIdRaw)) {
    return json(400, { error: "groupId must be a positive integer." });
  }
  const groupId = BigInt(groupIdRaw);
  if (typeof body.address !== "string" || !isAddress(body.address)) {
    return json(400, { error: "address must be the wallet you will join with." });
  }
  const account = getAddress(body.address);

  // 3. The wallet must be one of this user's linked wallets, per Privy (never trust the client).
  let linked: string[];
  try {
    const user = await privy.users()._get(userId);
    linked = user.linked_accounts
      .filter((a) => a.type === "wallet" && "chain_type" in a && a.chain_type === "ethereum")
      .map((a) => ("address" in a ? String(a.address).toLowerCase() : ""))
      .filter(Boolean);
  } catch {
    return json(502, { error: "Could not load your account from Privy. Try again." });
  }
  if (!linked.includes(account.toLowerCase())) {
    return json(403, { error: "That wallet is not linked to your account." });
  }

  // 4. Rate limit per Privy user.
  const now = Date.now();
  if (!withinRateLimit(userId, now)) {
    return json(429, { error: `Too many permits: max ${RATE_LIMIT} per hour.` });
  }

  // 5. Cheap onchain checks so we don't hand out useless permits.
  const signer = privateKeyToAccount(signerKey as Hex);
  const escrow = escrowAddress();
  try {
    if (!signerChecked) {
      const onchainSigner = await publicClient.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "inviteSigner",
      });
      if (getAddress(onchainSigner) !== signer.address) {
        return json(500, { error: "Server misconfigured: INVITE_SIGNER_PRIVATE_KEY is not the escrow's inviteSigner." });
      }
      signerChecked = true;
    }
    const group = await publicClient.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "getGroup",
      args: [groupId],
    });
    if (group.creator === "0x0000000000000000000000000000000000000000") {
      return json(404, { error: `Group ${groupId} does not exist.` });
    }
    const member = await publicClient.readContract({
      address: escrow,
      abi: escrowAbi,
      functionName: "isMember",
      args: [groupId, account],
    });
    if (member) return json(409, { error: `This wallet is already a member of group ${groupId}.` });
  } catch {
    return json(502, { error: "Could not reach the chain RPC. Try again." });
  }

  // 6. Sign the EIP-712 JoinPermit.
  const deadline = BigInt(Math.floor(now / 1000) + PERMIT_TTL_SECONDS);
  const signature = await signer.signTypedData({
    domain: { name: "BYWEscrow", version: "1", chainId: activeChain.id, verifyingContract: escrow as Address },
    types: JOIN_PERMIT_TYPES,
    primaryType: "JoinPermit",
    message: { groupId, account, deadline },
  });

  issued.get(userId)!.push(now);
  return json(200, { groupId: groupId.toString(), account, deadline: deadline.toString(), signature });
}
