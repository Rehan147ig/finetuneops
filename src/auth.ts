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
