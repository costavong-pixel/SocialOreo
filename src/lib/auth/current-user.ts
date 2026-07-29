import { auth0 } from "@/lib/auth/auth0";

export type SessionUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
};

export type VerifiedSessionUser = SessionUser & {
  email: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth0.getSession();
  const claims = session?.user as Record<string, unknown> | undefined;
  const id = typeof claims?.sub === "string" ? claims.sub : null;

  if (!id) {
    return null;
  }

  return {
    id,
    email: typeof claims?.email === "string" ? claims.email : null,
    emailVerified: claims?.email_verified === true,
  };
}

export async function getVerifiedSessionUser(): Promise<VerifiedSessionUser | null> {
  const user = await getSessionUser();

  if (!user || !user.email || !user.emailVerified) {
    return null;
  }

  return { ...user, email: user.email };
}
