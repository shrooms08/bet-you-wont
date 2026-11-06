// Input validation for every API route (zod). Pure: safe to unit test.
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { UPLOAD_RULES } from "./media";

/** A positive onchain id, as a JSON number or a decimal string, returned as bigint. */
export const idSchema = z
  .union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[1-9][0-9]{0,18}$/)])
  .transform((v) => BigInt(v));

export const addressSchema = z
  .string()
  .refine((v) => isAddress(v, { strict: false }), "must be a 0x address")
  .transform((v) => getAddress(v) as Address);

export const txHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte transaction hash")
  .transform((v) => v.toLowerCase() as Hex);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: letters, numbers and underscores");

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "give the group a name")
  .refine((v) => [...v].length <= 40, "40 characters max");

/** Unambiguous lowercase alphabet for invite codes: no 0/o, 1/l/i. */
export const INVITE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const inviteCodeSchema = z.string().regex(new RegExp(`^[${INVITE_ALPHABET}]{10}$`), "invalid invite code");

export const dareTextSchema = z
  .string()
  .transform((v) => v.trim())
  .refine((v) => [...v].length >= 3, "dare text must be at least 3 characters")
  .refine((v) => [...v].length <= 140, "dare text must be 140 characters or fewer");

export const uploadRequestSchema = z
  .object({
    kind: z.enum(["avatar", "proof"]),
    mime: z.string(),
    size: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    const rule = UPLOAD_RULES[v.kind];
    if (!rule.mimes[v.mime]) {
      ctx.addIssue({ code: "custom", path: ["mime"], message: `${v.kind} must be one of ${Object.keys(rule.mimes).join(", ")}` });
    }
    if (v.size > rule.maxBytes) {
      ctx.addIssue({ code: "custom", path: ["size"], message: `${v.kind} must be ${rule.maxBytes / 1024 / 1024} MB or smaller` });
    }
  });

export const profileSchema = z.object({
  username: usernameSchema,
  avatarPath: z.string().max(200).optional(),
});

export const registerGroupSchema = z.object({ txHash: txHashSchema, name: groupNameSchema });

export const permitSchema = z.object({
  groupId: idSchema,
  inviteCode: z.string().trim().toLowerCase().pipe(inviteCodeSchema).optional(),
  /** Optional: which linked wallet to join with (else the X-Wallet-Address / default wallet). */
  address: addressSchema.optional(),
});

export const draftSchema = z.object({ groupId: idSchema, text: dareTextSchema });

export const finalizeProofSchema = z.object({
  dareId: idSchema,
  storagePath: z.string().max(200),
  sessionId: z.uuid(),
  kind: z.enum(["photo", "video"]),
  capturedAt: z.iso.datetime({ offset: true }),
  durationMs: z.number().int().min(0).max(31_000).optional(),
  posterPath: z.string().max(200).optional(),
});

/** First issue's message, for friendly 400s. */
export function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "invalid input";
  const where = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue.message}`;
}
