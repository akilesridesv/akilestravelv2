import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useApp, type LocalUser } from "@/state/store";
import type { UserRole } from "@/types/domain";
import {
  ensureProviderProfile,
  loadProviderProfile,
  ensureTouristProfile,
  loadExperiences,
  loadBookings,
  loadMyBookings,
} from "@/data/repo";

export interface AuthResult {
  error?: string;
  needsConfirm?: boolean;
}

function sessionUser(u: { id: string; email?: string; user_metadata?: any }): LocalUser {
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.user_metadata?.name ?? (u.email ? u.email.split("@")[0] : "Proveedor"),
  };
}

/** Load a PROVIDER's profile + data into the store (creates the profile if
 *  missing — only used on provider sign-up/sign-in). */
export async function bootstrapProvider(user: LocalUser): Promise<void> {
  const provider = await ensureProviderProfile(user.id, user.name);
  const [experiences, bookings] = await Promise.all([loadExperiences(user.id), loadBookings()]);
  useApp.getState().setSession(user, provider, experiences, bookings);
}

/** Load a TOURIST's account (profile + their own bookings) into the store. */
export async function bootstrapTourist(user: LocalUser): Promise<void> {
  const profile = await ensureTouristProfile(user.id, user.name, user.email);
  const bookings = await loadMyBookings();
  useApp.getState().setTouristSession(user, profile, bookings);
}

/** Restore path: pick the surface from whether a provider profile exists, so
 *  we never turn a tourist into a provider by accident. */
export async function bootstrapByRole(user: LocalUser): Promise<void> {
  const provider = await loadProviderProfile(user.id);
  if (provider) {
    const [experiences, bookings] = await Promise.all([loadExperiences(user.id), loadBookings()]);
    useApp.getState().setSession(user, provider, experiences, bookings);
  } else {
    await bootstrapTourist(user);
  }
}

export async function authSignIn(email: string, password: string, name?: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    useApp.getState().signIn(email, name);
    return {};
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  const { data } = await supabase.auth.getUser();
  if (data.user) await bootstrapByRole(sessionUser(data.user));
  return {};
}

export async function authSignUp(
  email: string,
  password: string,
  name: string,
  role: UserRole = "provider"
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) {
    useApp.getState().signIn(email, name);
    return {};
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  });
  if (error) return { error: error.message };
  if (data.session && data.user) {
    const u = sessionUser(data.user);
    if (role === "tourist") await bootstrapTourist(u);
    else await bootstrapProvider(u);
    return {};
  }
  return { needsConfirm: true };
}

export async function authGoogle(next = "/panel"): Promise<AuthResult> {
  if (!supabase) return { error: "Configura Supabase para usar Google." };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + next },
  });
  return error ? { error: error.message } : {};
}

export async function authSignOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  useApp.getState().signOut();
}

/** Send a password-reset email; the link returns to /reset. */
export async function authResetPassword(email: string): Promise<AuthResult> {
  if (!supabase) return { error: "Configura Supabase para restablecer la contraseña." };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset",
  });
  return error ? { error: error.message } : {};
}

/** Set a new password for the recovering user (on the /reset page). */
export async function authUpdatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return { error: "Configura Supabase." };
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { error: error.message } : {};
}

/** On app start: restore an existing session and listen for auth changes. */
export function initAuth(): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const c = supabase;
  // Supabase re-emits SIGNED_IN on token refresh and when the tab regains focus,
  // and getSession() + the listener both fire on load. Bootstrapping on each one
  // replaces the store's experiences/provider arrays, which makes data hooks
  // refetch and the UI flash. Load each user only once; reset on sign-out.
  let loadedUserId: string | null = null;
  const boot = (user: LocalUser) => {
    if (loadedUserId === user.id) return;
    loadedUserId = user.id;
    bootstrapByRole(user).catch((e) => {
      console.error(e);
      loadedUserId = null; // allow a retry if the load failed
      useApp.getState().setAuthReady();
    });
  };
  c.auth.getSession().then(({ data }) => {
    if (data.session?.user) {
      boot(sessionUser(data.session.user));
    } else {
      // No session in remote mode: drop any stale local user and require login.
      useApp.getState().signOut();
      useApp.getState().setAuthReady();
    }
  });
  const { data: sub } = c.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session?.user) {
      boot(sessionUser(session.user));
    } else if (event === "SIGNED_OUT") {
      loadedUserId = null;
      useApp.getState().signOut();
    }
  });
  return () => sub.subscription.unsubscribe();
}
