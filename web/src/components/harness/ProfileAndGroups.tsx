"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEventLogs } from "viem";
import { activeChain, escrowAbi, escrowAddress } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { uploadFile } from "@/lib/upload";
import { useMe, type Byw } from "./useByw";
import { btn, btnGray, IDLE, input, link, Section, TxView, Who, type TxState } from "./ui";

export function ProfileSection({ byw }: { byw: Byw }) {
  const me = useMe(byw);
  const [username, setUsername] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [availability, setAvailability] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>(IDLE);

  async function checkName() {
    const res = await fetch(`/api/profile/check?username=${encodeURIComponent(username)}`);
    const body = (await res.json()) as { valid?: boolean; available?: boolean; reason?: string; error?: string };
    setAvailability(
      !res.ok ? `❌ ${body.error}` : !body.valid ? `❌ ${body.reason}` : body.available ? "✅ available" : "❌ taken",
    );
  }

  async function save() {
    try {
      let avatarPath: string | undefined;
      if (file) {
        setTx({ status: "working", step: "Uploading avatar…" });
        avatarPath = await uploadFile(byw, "avatar", file);
      }
      setTx({ status: "working", step: "Saving profile…" });
      const name = username || me.data?.profile?.username || "";
      await byw.api("/api/profile", { body: { username: name, avatarPath } });
      await me.refetch();
      setTx({ status: "done", message: `Saved @${name.toLowerCase()}` });
    } catch (err) {
      setTx({ status: "error", message: describeError(err) });
    }
  }

  return (
    <Section title="1. Your @name and avatar">
      <p className="text-sm">
        Current: {me.isLoading ? "…" : me.data?.profile ? <Who p={me.data.profile} /> : "no profile yet"}
        {me.error && <span className="text-red-400"> {describeError(me.error)}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={input}
          placeholder={me.data?.profile?.username ?? "username"}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value.trim());
            setAvailability(null);
          }}
        />
        <button className={btnGray} disabled={!username} onClick={() => void checkName()}>
          Check
        </button>
        {availability && <span className="text-sm">{availability}</span>}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="text-sm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button
        className={btn}
        disabled={tx.status === "working" || (!username && !me.data?.profile)}
        onClick={() => void save()}
      >
        Save profile
      </button>
      <TxView tx={tx} />
    </Section>
  );
}

export function CreateGroupSection({ byw }: { byw: Byw }) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [tx, setTx] = useState<TxState>(IDLE);
  const [invite, setInvite] = useState<string | null>(null);

  async function create() {
    if (!byw.address || !byw.publicClient) return;
    setInvite(null);
    const account = byw.address;
    const publicClient = byw.publicClient;
    const receipt = await byw.runTx(setTx, {
      simulate: () =>
        publicClient.simulateContract({ account, address: escrowAddress(), abi: escrowAbi, functionName: "createGroup", args: [isPublic] }),
      send: () =>
        byw.writeContractAsync({ address: escrowAddress(), abi: escrowAbi, functionName: "createGroup", args: [isPublic], chainId: activeChain.id }),
      done: "Group created onchain",
    });
    if (!receipt) return;
    try {
      setTx({ status: "working", step: "Registering name…", hash: receipt.transactionHash });
      const [event] = parseEventLogs({ abi: escrowAbi, eventName: "GroupCreated", logs: receipt.logs });
      const res = await byw.api<{ invitePath: string; group: { id: number } }>("/api/groups/register", {
        body: { txHash: receipt.transactionHash, name },
      });
      setInvite(`${window.location.origin}${res.invitePath}`);
      await byw.syncNow();
      setTx({ status: "done", hash: receipt.transactionHash, message: `Created group ${event?.args.groupId ?? res.group.id} "${name}"` });
    } catch (err) {
      setTx({ status: "error", message: `Group was created onchain, but naming failed: ${describeError(err)}`, hash: receipt.transactionHash });
    }
  }

  return (
    <Section title="2. Create a group">
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} placeholder="group name (1-40)" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> public
        </label>
        <button className={btn} disabled={!name.trim() || tx.status === "working"} onClick={() => void create()}>
          Create group
        </button>
      </div>
      <TxView tx={tx} />
      {invite && (
        <p className="break-all text-sm">
          Invite link:{" "}
          <a className={link} href={invite}>
            {invite}
          </a>{" "}
          <button className={btnGray} onClick={() => void navigator.clipboard.writeText(invite)}>
            Copy
          </button>
        </p>
      )}
    </Section>
  );
}

export function JoinSection({ byw }: { byw: Byw }) {
  const router = useRouter();
  const [linkOrCode, setLinkOrCode] = useState("");
  const [groupId, setGroupId] = useState("");
  const [tx, setTx] = useState<TxState>(IDLE);

  function openInvite() {
    const code = linkOrCode.trim().split("/i/").pop()?.split(/[?#/]/)[0] ?? "";
    if (code) router.push(`/i/${code}`);
  }

  async function joinPublic() {
    if (!byw.address || !byw.publicClient || !/^[1-9][0-9]*$/.test(groupId)) return;
    const account = byw.address;
    const publicClient = byw.publicClient;
    try {
      setTx({ status: "working", step: "Requesting permit…" });
      const permit = await byw.api<{ deadline: string; signature: `0x${string}` }>("/api/permit", { body: { groupId } });
      const args = [BigInt(groupId), BigInt(permit.deadline), permit.signature] as const;
      await byw.runTx(setTx, {
        simulate: () => publicClient.simulateContract({ account, address: escrowAddress(), abi: escrowAbi, functionName: "joinGroup", args }),
        send: () => byw.writeContractAsync({ address: escrowAddress(), abi: escrowAbi, functionName: "joinGroup", args, chainId: activeChain.id }),
        done: `Joined group ${groupId}`,
      });
    } catch (err) {
      setTx({ status: "error", message: describeError(err) });
    }
  }

  return (
    <Section title="3. Join a group">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${input} min-w-0 flex-1`}
          placeholder="paste an invite link or code"
          value={linkOrCode}
          onChange={(e) => setLinkOrCode(e.target.value)}
        />
        <button className={btn} disabled={!linkOrCode.trim()} onClick={openInvite}>
          Open invite
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} w-28`} placeholder="groupId" inputMode="numeric" value={groupId} onChange={(e) => setGroupId(e.target.value.trim())} />
        <button className={btnGray} disabled={tx.status === "working"} onClick={() => void joinPublic()}>
          Join public group by id
        </button>
      </div>
      <TxView tx={tx} />
    </Section>
  );
}
