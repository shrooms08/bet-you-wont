import "server-only";
import { ApiError } from "./http";

// Server-only configuration. Read lazily so a missing value fails the request that needs it,
// with a message that names the variable (never its value).

const PRIVY_SECRET_PLACEHOLDER = "PASTE_PRIVY_APP_SECRET_HERE";

function need(name: string, value: string | undefined): string {
  if (!value) throw new ApiError(500, `${name} is not set on the server. Add it to web/.env.local and restart.`);
  return value;
}

export const serverEnv = {
  privyAppId: () => need("NEXT_PUBLIC_PRIVY_APP_ID", process.env.NEXT_PUBLIC_PRIVY_APP_ID),
  privyAppSecret: () => {
    const v = need("PRIVY_APP_SECRET", process.env.PRIVY_APP_SECRET);
    if (v === PRIVY_SECRET_PLACEHOLDER) {
      throw new ApiError(500, "PRIVY_APP_SECRET is missing. Paste your Privy app secret into web/.env.local and restart the server.");
    }
    return v;
  },
  inviteSignerKey: () => {
    const v = need("INVITE_SIGNER_PRIVATE_KEY", process.env.INVITE_SIGNER_PRIVATE_KEY);
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new ApiError(500, "INVITE_SIGNER_PRIVATE_KEY is malformed in web/.env.local.");
    return v as `0x${string}`;
  },
  supabaseUrl: () => need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseSecretKey: () => need("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
};
