import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { timingSafeCompareStr } from "@/lib/timing-safe";

/**
 * Validates a service-to-service request by comparing a secret header
 * against an env var using a timing-safe, length-leak-free comparison
 * (timingSafeCompareStr pads inputs — no early return on length mismatch).
 *
 * Single canonical implementation — replaces the former copy-paste trio
 * validateInternalSecret (tasks), isValidInternalSecret (initiatives) and
 * verifySecret (cron/cleanup-planning). See feedback_security_recurring.md.
 *
 * Defaults match the agent-call convention: header `x-internal-secret`
 * checked against `INTERNAL_API_SECRET`. Cron routes pass
 * ("CRON_SECRET", "x-cron-secret").
 */
export function verifyInternalSecret(
  request: Request,
  envVar: string = "INTERNAL_API_SECRET",
  headerName: string = "x-internal-secret",
): boolean {
  const secret = process.env[envVar];
  if (!secret) return false;
  const header = request.headers.get(headerName) ?? "";
  return timingSafeCompareStr(header, secret);
}

/**
 * @deprecated Prefer `requireAuthApi()` — discriminated union, distinguishes
 * 401 vs 403 cleanly. This legacy helper remains only for handlers with
 * conditional auth flow (internal-secret bypass): POST /api/tasks,
 * POST/PUT /api/initiatives/[id], POST /api/initiatives/[id]/messages.
 *
 * Returns the authenticated user (any role), otherwise null.
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
 * @deprecated Prefer `requireOwnerApi()` (see `requireAuth` note).
 *
 * Returns the authenticated user if they have the OWNER role, otherwise null.
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
 * ARC-20260507-0006: discriminated-union API guard for new code, mirroring
 * the JF/SH pattern (`{ authorized, response | user }`) so handlers can
 * `if (!gate.authorized) return gate.response;` without re-implementing the
 * 401/403 NextResponse construction.
 *
 * Existing callers of `requireAuth()`/`requireOwner()` are unchanged — those
 * keep returning `User | null`. New /api routes should prefer the *Api
 * variants below. Codemod migration of existing callers is tracked
 * separately.
 */
export type AuthApiResult =
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof requireAuth>>>; email: string }
  | { authorized: false; response: Response };

export async function requireAuthApi(): Promise<AuthApiResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
  return { authorized: true, user, email: session.user.email };
}

export async function requireOwnerApi(): Promise<AuthApiResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
  if (user.role !== "OWNER") {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    };
  }
  return { authorized: true, user, email: session.user.email };
}

/**
 * Project-scoped authorization gate (REV-2026-06-01 VS tenant isolation).
 *
 * Returns null when the user is allowed to access tasks/messages/etc.
 * belonging to `projectId`, or a 403 Response otherwise.
 *
 * Rules:
 *   - OWNER role → always allowed (full tenant access).
 *   - Any other role → must have a `ProjectAccess` row for that projectId.
 *
 * Usage:
 *   const denied = await requireProjectAccess(user, initiative.projectId);
 *   if (denied) return denied;
 *
 * Centralized so every new route does not reinvent the role/ProjectAccess
 * check (see Architecture Review feedback_security_recurring.md).
 */
export async function requireProjectAccess(
  user: { id: string; role: string },
  projectId: string | null | undefined,
): Promise<Response | null> {
  if (!projectId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role === "OWNER") return null;
  const access = await prisma.projectAccess.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } },
    select: { id: true },
  });
  if (!access) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
