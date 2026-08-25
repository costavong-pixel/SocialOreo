import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  // A successful login must enter the authenticated product shell. Protected
  // route requests may still provide an explicit returnTo value, but the
  // normal public sign-in flow must never fall back to the marketing page.
  signInReturnToPath: "/home",
  authorizationParameters: {
    scope: "openid profile email",
  },
});
