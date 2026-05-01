import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Okta from "next-auth/providers/okta";
import { isDevAuthEnabled } from "@/lib/company/runtime";

const providers: any[] = [];

if (isDevAuthEnabled()) {
  providers.push(
    Credentials({
      id: "highli-dev",
      name: "highli dev auth",
      credentials: {
        role: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        const role = String(credentials?.role ?? "engineer");
        return {
          id: `dev-${role}`,
          email: `${role}@highli.dev`,
          name: role,
        };
      },
    }),
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (
  process.env.OKTA_CLIENT_ID &&
  process.env.OKTA_CLIENT_SECRET &&
  process.env.OKTA_ISSUER
) {
  providers.push(
    Okta({
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      issuer: process.env.OKTA_ISSUER,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.email ?? "unknown";
      }
      return session;
    },
  },
});
