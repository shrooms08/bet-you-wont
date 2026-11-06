"use client";

import { useLogin } from "@privy-io/react-auth";
import { useState } from "react";
import { formatEther, isAddress, type Address } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { CreateDareSection, FeedSection, HomeSection } from "@/components/harness/Dares";
import { CreateGroupSection, JoinSection, ProfileSection } from "@/components/harness/ProfileAndGroups";
import { Amount, btn, btnGray, card, input, link, Row, Section, Shell } from "@/components/harness/ui";
import { chainIdOf, useByw, useMe, usePrice } from "@/components/harness/useByw";
import { activeChain, escrowAbi, escrowAddress, explorerAddress, tokenAbi, tokenAddress, tokenSymbol } from "@/lib/contracts";
import { describeError } from "@/lib/errors";

export function HarnessPage() {
  const byw = useByw();
  const [loginMethod, setLoginMethod] = useState<string | null>(null);
  const { login } = useLogin({ onComplete: ({ loginMethod }) => setLoginMethod(loginMethod) });

  if (!byw.ready) return <Shell>Loading…</Shell>;
  if (!byw.authenticated) {
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
    loginMethod ?? (byw.user?.google ? "google" : byw.user?.email ? "email" : byw.user?.wallet ? "wallet" : "unknown");

  return (
    <Shell>
      <AccountCard byw={byw} method={method} />
      <ProfileSection byw={byw} />
      <CreateGroupSection byw={byw} />
      <JoinSection byw={byw} />
      <MyGroups byw={byw} />
      <CreateDareSection byw={byw} />
      <FeedSection byw={byw} />
      <HomeSection byw={byw} />
      <MembershipCheck byw={byw} />
    </Shell>
  );
}

function AccountCard({ byw, method }: { byw: ReturnType<typeof useByw>; method: string }) {
  const { address, activeWallet } = byw;
  const price = usePrice();
  const eth = useBalance({ address, chainId: activeChain.id, query: { enabled: !!address, refetchInterval: 15_000 } });
  const token = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: activeChain.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const ethValue = eth.data?.value;
  return (
    <>
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
          {activeWallet ? (activeWallet.walletClientType === "privy" ? "embedded (Privy)" : `external (${activeWallet.walletClientType})`) : "…"}
        </Row>
        <Row label="Wallet chain">
          {activeWallet ? chainIdOf(activeWallet) : "…"}
          {activeWallet && chainIdOf(activeWallet) !== activeChain.id && (
            <span className="ml-2 text-amber-400">(wrong network: you will be asked to switch)</span>
          )}
        </Row>
        <Row label="ETH">{ethValue === undefined ? "…" : formatEther(ethValue)}</Row>
        <Row label={tokenSymbol}>{token.data === undefined ? "…" : <Amount wei={token.data} />}</Row>
        <Row label="$wif price">
          {price.data?.usd ? `$${price.data.usd} (${price.data.source}; mainnet $wif)` : "unavailable"}
        </Row>
        <button className={`${btnGray} mt-2 self-start`} onClick={() => void byw.logout()}>
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
    </>
  );
}

function MyGroups({ byw }: { byw: ReturnType<typeof useByw> }) {
  const me = useMe(byw);
  return (
    <Section title="4. Your groups">
      {me.isLoading && <p className="text-sm">Loading…</p>}
      {me.error && <p className="text-sm text-red-400">{describeError(me.error)}</p>}
      {me.data?.groups.length === 0 && <p className="text-sm text-neutral-500">No groups yet.</p>}
      {me.data?.groups.map((g) => (
        <Row key={g.id} label={`#${g.id}`}>
          {g.name ?? "(unnamed)"} · {g.isPublic ? "public" : "private"} · {g.memberCount} members · {g.liveDareCount} live dares
          {g.inviteCode && (
            <>
              {" "}·{" "}
              <a className={link} href={`/i/${g.inviteCode}`}>
                invite link
              </a>
            </>
          )}
        </Row>
      ))}
    </Section>
  );
}

function MembershipCheck({ byw }: { byw: ReturnType<typeof useByw> }) {
  const [groupId, setGroupId] = useState("");
  const [who, setWho] = useState("");
  const [result, setResult] = useState<string | null>(null);
  async function check() {
    const account = who || byw.address || "";
    if (!byw.publicClient || !/^[1-9][0-9]*$/.test(groupId) || !isAddress(account)) {
      setResult("Enter a group id and a valid address.");
      return;
    }
    try {
      const member = await byw.publicClient.readContract({
        address: escrowAddress(),
        abi: escrowAbi,
        functionName: "isMember",
        args: [BigInt(groupId), account as Address],
      });
      setResult(`${account} ${member ? "IS" : "is NOT"} a member of group ${groupId} (onchain)`);
    } catch (err) {
      setResult(describeError(err));
    }
  }
  return (
    <Section title="8. Check membership (onchain)">
      <div className="flex flex-wrap gap-2">
        <input className={`${input} w-28`} placeholder="groupId" inputMode="numeric" value={groupId} onChange={(e) => setGroupId(e.target.value.trim())} />
        <input className={`${input} min-w-0 flex-1`} placeholder={byw.address ?? "address"} value={who} onChange={(e) => setWho(e.target.value.trim())} />
        <button className={btn} onClick={() => void check()}>
          Check
        </button>
      </div>
      {result && <p className="break-all text-sm">{result}</p>}
    </Section>
  );
}
