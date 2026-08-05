/**
 * Prisma adapter for Auth.js — Prisma 7 compatible.
 *
 * Based on @auth/prisma-adapter 2.11.1, adapted to work with Prisma 7
 * generated client (prisma-client provider with custom output path).
 *
 * Replaces @auth/prisma-adapter which imports PrismaClient from
 * @prisma/client — a package that no longer exists in Prisma 7.
 *
 * @see https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-prisma/src/index.ts
 * @see ARCH-R4-20260413-07
 */
import type { Adapter } from "@auth/core/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

function stripUndefined<T extends Record<string, unknown>>(obj: T) {
  const data: Record<string, unknown> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) data[key] = obj[key];
  }
  return { data };
}

export function PrismaAdapter(prisma: PrismaClient): Adapter {
  // Prisma 7 generated types include project-specific fields that don't match
  // Auth.js AdapterUser exactly (e.g. nullable email, extra columns).
  // We cast the prisma instance to avoid per-method return type mismatches
  // while keeping the function signature type-safe.
  const p = prisma as any;
  return {
    createUser: ({ id: _id, ...data }: any) => p.user.create(stripUndefined(data)),
    getUser: (id: string) => p.user.findUnique({ where: { id } }),
    getUserByEmail: (email: string) => p.user.findUnique({ where: { email } }),
    async getUserByAccount(provider_providerAccountId: any) {
      const account = await p.account.findUnique({
        where: { provider_providerAccountId },
        include: { user: true },
      });
      return account?.user ?? null;
    },
    updateUser: ({ id, ...data }: any) =>
      p.user.update({ where: { id }, ...stripUndefined(data) }),
    deleteUser: (id: string) => p.user.delete({ where: { id } }),
    linkAccount: (data: any) => p.account.create({ data }),
    unlinkAccount: (provider_providerAccountId: any) =>
      p.account.delete({ where: { provider_providerAccountId } }),
    async getSessionAndUser(sessionToken: string) {
      const userAndSession = await p.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!userAndSession) return null;
      const { user, ...session } = userAndSession;
      return { user, session };
    },
    createSession: (data: any) => p.session.create(stripUndefined(data)),
    updateSession: (data: any) =>
      p.session.update({
        where: { sessionToken: data.sessionToken },
        ...stripUndefined(data),
      }),
    deleteSession: (sessionToken: string) =>
      p.session.delete({ where: { sessionToken } }),
    async createVerificationToken(data: any) {
      const verificationToken = await p.verificationToken.create(
        stripUndefined(data),
      );
      if ("id" in verificationToken && verificationToken.id)
        delete verificationToken.id;
      return verificationToken;
    },
    async useVerificationToken(identifier_token: any) {
      try {
        const verificationToken = await p.verificationToken.delete({
          where: { identifier_token },
        });
        if ("id" in verificationToken && verificationToken.id)
          delete verificationToken.id;
        return verificationToken;
      } catch (error: any) {
        if (error?.code === "P2025") return null;
        throw error;
      }
    },
    async getAccount(providerAccountId: string, provider: string) {
      return p.account.findFirst({
        where: { providerAccountId, provider },
      });
    },
  };
}
