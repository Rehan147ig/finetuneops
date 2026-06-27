import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import NextAuth from "next-auth";
import { compare } from "bcryptjs";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ensureOAuthUser } from "@/lib/onboarding";

const env = getServerEnv();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
    // 8-hour token lifetime: role/org changes propagate within one working day.
    // Without this, NextAuth defaults to 30 days — a revoked member keeps
    // access until their old token expires.
    maxAge: 8 * 60 * 60,
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);

        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: parsed.data.email.toLowerCase(),
          },
          include: {
            organization: true,
          },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const passwordMatches = await compare(parsed.data.password, user.passwordHash);

        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          organizationId: user.organizationId,
          role: user.role,
          workspaceSlug: user.organization.slug,
        };
      },
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email || account?.provider === "credentials") {
        return true;
      }

      const ensuredUser = await ensureOAuthUser({
        email: user.email,
        name: user.name,
        image: user.image,
      });

      user.id = ensuredUser.id;
      user.role = ensuredUser.role;
      user.organizationId = ensuredUser.organizationId;
      user.workspaceSlug = ensuredUser.organization.slug;

      return true;
    },
    async jwt({ token, user }) {
      // On initial sign-in: populate claims from DB.
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: {
            email: user.email.toLowerCase(),
          },
          include: {
            organization: true,
          },
        });

        if (dbUser) {
          token.sub = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.workspaceSlug = dbUser.organization.slug;
          token.claimsRefreshedAt = Date.now();
        }
      }

      // Re-fetch claims every 15 minutes so role changes and offboarding
      // propagate within one check interval rather than waiting for the full
      // 8-hour token lifetime.
      const refreshedAt = typeof token.claimsRefreshedAt === "number" ? token.claimsRefreshedAt : 0;
      const fifteenMinutes = 15 * 60 * 1000;
      if (token.sub && Date.now() - refreshedAt > fifteenMinutes) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          include: { organization: true },
        });

        if (dbUser) {
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.workspaceSlug = dbUser.organization.slug;
          token.claimsRefreshedAt = Date.now();
        } else {
          // User deleted — invalidate the token so next request returns 401.
          return null as unknown as typeof token;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = typeof token.role === "string" ? token.role : "viewer";
        session.user.organizationId =
          typeof token.organizationId === "string" ? token.organizationId : "";
        session.user.workspaceSlug =
          typeof token.workspaceSlug === "string" ? token.workspaceSlug : "";
      }

      return session;
    },
  },
});
