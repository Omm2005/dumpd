import { createDb } from "@dumpd/db";
import * as schema from "@dumpd/db/schema/auth";
import { env } from "@dumpd/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : undefined,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      magicLink({
        sendMagicLink: ({ email, url }) => {
          console.info(`Magic login link for ${email}: ${url}`);
        },
      }),
      nextCookies(),
    ],
  });
}

export const auth = createAuth();
