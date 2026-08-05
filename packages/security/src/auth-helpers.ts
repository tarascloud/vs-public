/**
 * Auth helpers — canonical pattern for Next.js App Router API routes
 * across PD, JF, SH, VS.
 *
 * Pattern: RETURN-OR-NULL. Callers check for null and return 401/403.
 * This is intentionally different from the "throws on failure" pattern
 * so routes can compose multiple auth checks (e.g. OWNER || featureFlag)
 * without try/catch.
 *
 * SCAFFOLD NOTE (2026-04-19): This file expects two symbols that
 * each consumer project must provide via path aliases (tsconfig.json):
 *
 *   import { auth } from "@/auth"          // NextAuth v5 instance
 *   import { prisma } from "@/lib/prisma"  // PrismaClient instance
 *
 * Real monorepo extraction will invert this: each consumer injects
 * `auth` and `prisma` via `createAuthHelpers({ auth, prisma })`.
 * See ADR `shared-security-utils.md` §Migration path.
 *
 * For now this scaffold documents the canonical API shape. Do NOT copy
 * into your project yet — wait for the DI refactor.
 */

// Placeholder imports — consumer projects resolve these via path aliases.
// @ts-expect-error -- scaffold stage, consumer will provide these
import { auth } from "@/auth";
// @ts-expect-error -- scaffold stage, consumer will provide these
import { prisma } from "@/lib/prisma";

/**
 * Returns the authenticated user (any role), otherwise null.
 *
 * ```ts
 * const user = await requireAuth();
 * if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
 * ```
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) return null;
  return user;
}

/**
 * Returns the authenticated user if they have the OWNER role, otherwise null.
 *
 * ```ts
 * const owner = await requireOwner();
 * if (!owner) return Response.json({ error: "Forbidden" }, { status: 403 });
 * ```
 */
export async function requireOwner() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user || user.role !== "OWNER") return null;
  return user;
}

/**
 * Throw-style variant for server components / server actions where
 * returning null is awkward. Throws a NextAuth-compatible error that
 * Next.js catches and renders as 401.
 */
export async function requireAuthOrThrow() {
  const user = await requireAuth();
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return user;
}

export async function requireOwnerOrThrow() {
  const user = await requireOwner();
  if (!user) {
    const err = new Error("Forbidden");
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
  return user;
}
