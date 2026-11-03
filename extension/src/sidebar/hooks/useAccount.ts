import { useEffect, useState } from "react";
import type { User } from "../../shared/types";

const DEV_MODE = (import.meta.env.VITE_DEV_MODE as string | undefined) === "true";

// Local dev and CI run against a DEV_MODE backend that accepts a stub bearer,
// so they keep the old local admin instead of a real account.
const DEV_USER: User = { id: "local-user", email: "local@clientlens.app", name: "You", role: "admin" };

export type AccountState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: User }
  | { status: "error"; message: string };

// The signed-in account: the Supabase session plus the caller's own
// user_profiles row (RLS lets a user read only their own). Follows sign-in,
// sign-out and token refresh through onAuthStateChange.
export function useAccount(): AccountState {
  const [state, setState] = useState<AccountState>(DEV_MODE ? { status: "signed-in", user: DEV_USER } : { status: "loading" });

  useEffect(() => {
    if (DEV_MODE) return;
    let alive = true;
    let unsubscribe = () => {};

    (async () => {
      const { supabase } = await import("../../shared/utils/supabase");
      const load = async (userId: string | undefined, email: string | undefined) => {
        if (!userId) { if (alive) setState({ status: "signed-out" }); return; }
        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, email, name, role, avatar_url")
          .eq("id", userId)
          .maybeSingle();
        if (!alive) return;
        if (error || !data) {
          setState({ status: "error", message: error?.message || "Your profile wasn't found. Sign out and sign in again." });
          return;
        }
        setState({ status: "signed-in", user: { ...data, name: data.name || email?.split("@")[0] || "You" } as User });
      };

      const { data } = await supabase.auth.getSession();
      await load(data.session?.user.id, data.session?.user.email);
      const sub = supabase.auth.onAuthStateChange((event, session) => {
        // A token refresh keeps the same user, so there's nothing to reload.
        if (event === "TOKEN_REFRESHED") return;
        void load(session?.user.id, session?.user.email);
      });
      unsubscribe = () => sub.data.subscription.unsubscribe();
    })().catch((e: unknown) => {
      if (alive) setState({ status: "error", message: e instanceof Error ? e.message : "Couldn't reach the sign-in service." });
    });

    return () => { alive = false; unsubscribe(); };
  }, []);

  return state;
}

export async function signOut(): Promise<void> {
  if (DEV_MODE) return;
  const { supabase } = await import("../../shared/utils/supabase");
  await supabase.auth.signOut();
}
