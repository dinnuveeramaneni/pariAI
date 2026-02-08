import type { NextAuthOptions, Session } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

declare global {
  var authBypassUserId: string | undefined;
}

const AUTH_BYPASS = process.env.AUTH_BYPASS === "1";
const AUTH_BYPASS_EMAIL = process.env.AUTH_BYPASS_EMAIL ?? "dev@local.test";
const AUTH_BYPASS_NAME = process.env.AUTH_BYPASS_NAME ?? "Dev Bypass User";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const valid = await verifyPassword(
          credentials.password,
          user.passwordHash,
        );
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        return token;
      }

      if (token.uid || !token.email) {
        return token;
      }

      const email = token.email.toLowerCase();
      let dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            email,
            name: token.name,
            image: token.picture,
          },
        });
      }

      token.uid = dbUser.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid;
      }
      return session;
    },
  },
  events: {
    async signIn(message) {
      const email = message.user.email?.toLowerCase();
      if (!email) {
        return;
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          memberships: {
            take: 1,
            orderBy: { createdAt: "asc" },
          },
        },
      });

      const primaryOrgId = user?.memberships[0]?.orgId;
      if (!user || !primaryOrgId) {
        return;
      }

      await prisma.auditLog.create({
        data: {
          orgId: primaryOrgId,
          actorUserId: user.id,
          action: "auth.login",
          targetType: "user",
          targetId: user.id,
          metadata: {
            provider: message.account?.provider ?? "credentials",
          },
        },
      });
    },
  },
};

async function getBypassSession(): Promise<Session> {
  if (!global.authBypassUserId) {
    try {
      const user = await prisma.user.upsert({
        where: { email: AUTH_BYPASS_EMAIL.toLowerCase() },
        update: { name: AUTH_BYPASS_NAME },
        create: {
          email: AUTH_BYPASS_EMAIL.toLowerCase(),
          name: AUTH_BYPASS_NAME,
        },
        select: { id: true, email: true, name: true },
      });
      global.authBypassUserId = user.id;
    } catch {
      global.authBypassUserId = "bypass-user";
    }
  }

  return {
    user: {
      id: global.authBypassUserId,
      email: AUTH_BYPASS_EMAIL.toLowerCase(),
      name: AUTH_BYPASS_NAME,
      image: null,
    },
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function auth() {
  if (AUTH_BYPASS) {
    return getBypassSession();
  }

  return getServerSession(authOptions);
}
