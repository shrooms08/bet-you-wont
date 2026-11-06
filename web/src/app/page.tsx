"use client";

import { useLogin, usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEther, formatUnits, isAddress, parseEventLogs, type Address, type Hex } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import {
  activeChain,
  escrowAbi,
  escrowAddress,
  explorerAddress,
  explorerTx,
  tokenAbi,
  tokenAddress,
  tokenSymbol,
} from "@/lib/contracts";
import { describeError } from "@/lib/errors";

type TxState =
  | { status: "idle" }
  | { status: "working"; step: string; hash?: Hex }
  | { status: "done"; hash: Hex; message: string }
  | { status: "error"; message: string; hash?: Hex };

const IDLE: TxState = { status: "idle" };

function chainIdOf(wallet: ConnectedWallet): number {
  return Number(wallet.chainId.split(":")[1]);
}

export default function Home() {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const [loginMethod, setLoginMethod] = useState<string | null>(null);
  const { login } = useLogin({ onComplete: ({ loginMethod }) => setLoginMethod(loginMethod) });
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();

  // Use the wallet linked to the Privy account: the embedded wallet for email/Google users,
  // the external wallet for wallet logins. Avoids accidentally using some other injected wallet.
  const preferred = useMemo(() => {
    const primary = user?.wallet?.address?.toLowerCase();
    return (
      wallets.find((w) => w.address.toLowerCase() === primary) ??
      wallets.find((w) => w.walletClientType === "privy") ??
      wallets[0]
    );
  }, [wallets, user?.wallet?.address]);

  useEffect(() => {
    if (preferred && preferred.address.toLowerCase() !== address?.toLowerCase()) {
      void setActiveWallet(preferred);
    }
  }, [preferred, address, setActiveWallet]);

  const activeWallet = wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase());
  const isEmbedded = activeWallet?.walletClientType === "privy";

  const eth = useBalance({
    address,
    chainId: activeChain.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const token = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChain.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const [createTx, setCreateTx] = useState<TxState>(IDLE);
  const [joinTx, setJoinTx] = useState<TxState>(IDLE);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);
  const [joinGroupId, setJoinGroupId] = useState("");
  const [checkGroupId, setCheckGroupId] = useState("");
  const [checkAddress, setCheckAddress] = useState("");
  const [memberResult, setMemberResult] = useState<string | null>(null);

  if (!ready) return <Shell>Loading…</Shell>;

  if (!authenticated) {
    return (
      <Shell>
        <p className="text-neutral-400">Network: {activeChain.name}</p>
        <button className={btn} onClick={() => login()}>
          Log in
        </button>
      </Shell>
    );
  }

  const method =
    loginMethod ?? (user?.google ? "google" : user?.email ? "email" : user?.wallet ? "wallet" : "unknown");

  /** Puts the active wallet on the app's chain. External wallets get a switch/add-network prompt. */
  async function ensureChain() {
    if (!activeWallet) throw new Error("No active wallet yet. Wait a second and retry.");
    if (chainIdOf(activeWallet) !== activeChain.id) await activeWallet.switchChain(activeChain.id);
  }

  async function createGroup() {
    if (!address || !publicClient) return;
    setNewGroupId(null);
    try {
      setCreateTx({ status: "working", step: "Checking network…" });
      await ensureChain();
      const escrow = escrowAddress();
      setCreateTx({ status: "working", step: "Simulating…" });
      await publicClient.simulateContract({
        account: address,
        address: escrow,
        abi: escrowAbi,
        functionName: "createGroup",
        args: [true],
      });
      setCreateTx({ status: "working", step: "Confirm in your wallet…" });
      const hash = await writeContractAsync({
        address: escrow,
        abi: escrowAbi,
        functionName: "createGroup",
        args: [true],
        chainId: activeChain.id,
      });
      setCreateTx({ status: "working", step: "Waiting for confirmation…", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Object.assign(new Error("Transaction reverted"), { hash });
      const [event] = parseEventLogs({ abi: escrowAbi, eventName: "GroupCreated", logs: receipt.logs });
      const id = event ? event.args.groupId.toString() : null;
      setNewGroupId(id);
      setCreateTx({ status: "done", hash, message: id ? `Created group ${id}` : "Mined (no GroupCreated event?)" });
      void eth.refetch();
    } catch (err) {
      setCreateTx({ status: "error", message: describeError(err), hash: (err as { hash?: Hex }).hash });
    }
  }

  async function joinGroup() {
    if (!address || !publicClient) return;
    if (!/^[1-9][0-9]*$/.test(joinGroupId)) {
      setJoinTx({ status: "error", message: "Enter a group id (a positive number)." });
      return;
    }
    try {
      setJoinTx({ status: "working", step: "Requesting permit…" });
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("No Privy access token; log in again.");
      const res = await fetch("/api/permit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ groupId: joinGroupId, address }),
      });
      const permit = (await res.json()) as { deadline?: string; signature?: Hex; error?: string };
      if (!res.ok || !permit.deadline || !permit.signature) {
        throw new Error(`Permit refused (${res.status}): ${permit.error ?? "unknown error"}`);
      }
      const args = [BigInt(joinGroupId), BigInt(permit.deadline), permit.signature] as const;

      setJoinTx({ status: "working", step: "Checking network…" });
      await ensureChain();
      const escrow = escrowAddress();
      setJoinTx({ status: "working", step: "Simulating…" });
      await publicClient.simulateContract({
        account: address,
        address: escrow,
        abi: escrowAbi,
        functionName: "joinGroup",
        args,
      });
      setJoinTx({ status: "working", step: "Confirm in your wallet…" });
      const hash = await writeContractAsync({
        address: escrow,
        abi: escrowAbi,
        functionName: "joinGroup",
        args,
        chainId: activeChain.id,
      });
      setJoinTx({ status: "working", step: "Waiting for confirmation…", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Object.assign(new Error("Transaction reverted"), { hash });
      setJoinTx({ status: "done", hash, message: `Joined group ${joinGroupId}` });
      void eth.refetch();
    } catch (err) {
      setJoinTx({ status: "error", message: describeError(err), hash: (err as { hash?: Hex }).hash });
    }
  }

  async function checkMembership() {
    if (!publicClient) return;
    const who = (checkAddress || address || "") as string;
    if (!/^[1-9][0-9]*$/.test(checkGroupId) || !isAddress(who)) {
      setMemberResult("Enter a group id and a valid address.");
      return;
    }
    try {
      const member = await publicClient.readContract({
        address: escrowAddress(),
        abi: escrowAbi,
        functionName: "isMember",
        args: [BigInt(checkGroupId), who as Address],
      });
      setMemberResult(`${who} ${member ? "IS" : "is NOT"} a member of group ${checkGroupId}`);
    } catch (err) {
      setMemberResult(describeError(err));
    }
  }

  const ethValue = eth.data?.value;
  const busy = createTx.status === "working" || joinTx.status === "working";

  return (
    <Shell>
      <section className={card}>
        <Row label="Network">
          {activeChain.name} ({activeChain.id})
        </Row>
        <Row label="Login method">{method}</Row>
        <Row label="Wallet">
          {address ? (
            <a className={link} href={explorerAddress(address)} target="_blank" rel="noreferrer">
              {address}
            </a>
          ) : (
            "connecting…"
          )}
        </Row>
        <Row label="Wallet type">
          {activeWallet ? (isEmbedded ? "embedded (Privy)" : `external (${activeWallet.walletClientType})`) : "…"}
        </Row>
        <Row label="Wallet chain">
          {activeWallet ? chainIdOf(activeWallet) : "…"}
          {activeWallet && chainIdOf(activeWallet) !== activeChain.id && (
            <span className="ml-2 text-amber-400">(wrong network: you will be asked to switch)</span>
          )}
        </Row>
        <Row label="ETH">{ethValue === undefined ? "…" : formatEther(ethValue)}</Row>
        <Row label={tokenSymbol}>{token.data === undefined ? "…" : formatUnits(token.data, 18)}</Row>
        <button className={`${btn} mt-3 bg-neutral-700`} onClick={() => logout()}>
          Log out
        </button>
      </section>

      {address && ethValue === BigInt(0) && (
        <section className="rounded border border-amber-500 bg-amber-950 p-4 text-amber-200">
          <p className="font-semibold">You need a little testnet ETH for gas</p>
          <p className="mt-1 break-all font-mono text-sm">{address}</p>
          <button className={`${btn} mt-2`} onClick={() => void navigator.clipboard.writeText(address)}>
            Copy address
          </button>
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold">Create group</h2>
        <button className={btn} disabled={busy || !address} onClick={() => void createGroup()}>
          Create group
        </button>
        <TxView tx={createTx} />
        {newGroupId && <p className="text-lg">New groupId: {newGroupId}</p>}
      </section>

      <section className={card}>
        <h2 className="font-semibold">Join group</h2>
        <div className="flex gap-2">
          <input
            className={input}
            placeholder="groupId"
            inputMode="numeric"
            value={joinGroupId}
            onChange={(e) => setJoinGroupId(e.target.value.trim())}
          />
          <button className={btn} disabled={busy || !address} onClick={() => void joinGroup()}>
            Join group
          </button>
        </div>
        <TxView tx={joinTx} />
      </section>

      <section className={card}>
        <h2 className="font-semibold">Check membership</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className={input}
            placeholder="groupId"
            inputMode="numeric"
            value={checkGroupId}
            onChange={(e) => setCheckGroupId(e.target.value.trim())}
          />
          <input
            className={`${input} min-w-0 flex-1`}
            placeholder={address ?? "address"}
            value={checkAddress}
            onChange={(e) => setCheckAddress(e.target.value.trim())}
          />
          <button className={btn} onClick={() => void checkMembership()}>
            Check
          </button>
        </div>
        {memberResult && <p className="break-all text-sm">{memberResult}</p>}
      </section>
    </Shell>
  );
}

function TxView({ tx }: { tx: TxState }) {
  if (tx.status === "idle") return null;
  const hashLink =
    "hash" in tx && tx.hash ? (
      <a className={`${link} block break-all text-sm`} href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">
        tx: {tx.hash}
      </a>
    ) : null;
  if (tx.status === "working") {
    return (
      <div className="text-sm text-neutral-300">
        ⏳ {tx.step}
        {hashLink}
      </div>
    );
  }
  if (tx.status === "done") {
    return (
      <div className="text-sm text-green-400">
        ✅ {tx.message}
        {hashLink}
      </div>
    );
  }
  return (
    <div className="text-sm text-red-400">
      ❌ {tx.message}
      {hashLink}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Bet You Won&apos;t</h1>
      <p className="text-sm text-neutral-500">Phase 3a test page: login + onchain group create/join (testnet).</p>
      {children}
    </main>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <span className="w-28 shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 break-all">{children}</span>
    </div>
  );
}

const btn =
  "rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
const card = "flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-4";
const input = "w-28 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm";
const link = "text-indigo-400 underline";
