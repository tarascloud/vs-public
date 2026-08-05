import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * REV-2026-06-01 VS tenant-isolation guard tests.
 *
 * These tests exercise the route handlers for:
 *   - GET  /api/tasks
 *   - GET  /api/initiatives/[id]/messages
 *   - POST /api/initiatives/[id]/messages
 *
 * The auth + prisma modules are mocked so the handlers can be invoked
 * directly as functions without any DB / Next.js runtime.
 *
 * NB: We mock at module-graph level, not via vi.spyOn, because Next.js
 * route handlers import their deps at module-eval time (server bundle).
 */

// ---- Shared mock state ----------------------------------------------------

type MockUser = { id: string; role: "OWNER" | "CLIENT" | "VIEWER"; email: string };
let currentUser: MockUser | null = null;

const prismaMock = {
  task: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  projectAccess: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  initiative: {
    findUnique: vi.fn(),
  },
  initiativeMessage: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (currentUser ? { user: { email: currentUser.email, id: currentUser.id } } : null)),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimitOrNull: vi.fn(async () => null),
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 99 })),
}));

vi.mock("@/lib/initiative-callback", () => ({
  fireInitiativeCallback: vi.fn(async () => undefined),
}));

// auth-helpers reads prisma + auth; mock them transparently via the above.
// We still rely on the *real* requireAuth / requireProjectAccess implementations.
vi.mock("@/auth", async () => {
  return {
    auth: vi.fn(async () =>
      currentUser ? { user: { email: currentUser.email, id: currentUser.id } } : null,
    ),
  };
});

// Make prisma.user.findUnique resolve to currentUser so requireAuth works.
beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { email?: string } }) => {
    if (!currentUser) return null;
    if (where.email && where.email !== currentUser.email) return null;
    return currentUser;
  });
  prismaMock.task.findMany.mockReset();
  prismaMock.task.findMany.mockResolvedValue([]);
  prismaMock.task.count.mockReset();
  prismaMock.task.count.mockResolvedValue(0);
  prismaMock.projectAccess.findMany.mockReset();
  prismaMock.projectAccess.findFirst.mockReset();
  prismaMock.projectAccess.findUnique.mockReset();
  prismaMock.initiative.findUnique.mockReset();
  prismaMock.initiativeMessage.findMany.mockReset();
  prismaMock.initiativeMessage.findMany.mockResolvedValue([]);
  prismaMock.initiativeMessage.create.mockReset();
});

// ---- Helpers --------------------------------------------------------------

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function importTasksGET() {
  const mod = await import("@/app/api/tasks/route");
  return mod.GET;
}

async function importMessagesRoute() {
  const mod = await import("@/app/api/initiatives/[id]/messages/route");
  return { GET: mod.GET, POST: mod.POST };
}

const fakeParams = (id: string) => ({ params: Promise.resolve({ id }) });

// ---- GET /api/tasks -------------------------------------------------------

describe("GET /api/tasks — tenant isolation", () => {
  it("returns 401 when unauthenticated and no internal secret", async () => {
    currentUser = null;
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks"));
    expect(res.status).toBe(401);
  });

  it("OWNER sees all tasks (no project filter applied)", async () => {
    currentUser = { id: "u-owner", role: "OWNER", email: "o@x" };
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks"));
    expect(res.status).toBe(200);
    // No projectAccess query at all for OWNER.
    expect(prismaMock.projectAccess.findMany).not.toHaveBeenCalled();
    expect(prismaMock.task.findMany).toHaveBeenCalled();
    const whereArg = prismaMock.task.findMany.mock.calls[0]![0]!.where;
    expect(whereArg.initiative).toBeUndefined();
  });

  it("VIEWER without ProjectAccess gets [] (initiative.projectId IN [])", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    prismaMock.projectAccess.findMany.mockResolvedValueOnce([]);
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks"));
    expect(res.status).toBe(200);
    expect(prismaMock.projectAccess.findMany).toHaveBeenCalledWith({
      where: { userId: "u-viewer" },
      select: { projectId: true },
    });
    const whereArg = prismaMock.task.findMany.mock.calls[0]![0]!.where;
    expect(whereArg.initiative).toEqual({ projectId: { in: [] } });
  });

  it("VIEWER with ProjectAccess only sees tasks of accessible projects", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    prismaMock.projectAccess.findMany.mockResolvedValueOnce([{ projectId: "p1" }]);
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks"));
    expect(res.status).toBe(200);
    const whereArg = prismaMock.task.findMany.mock.calls[0]![0]!.where;
    expect(whereArg.initiative).toEqual({ projectId: { in: ["p1"] } });
  });

  it("CLIENT with ProjectAccess only sees their project tasks", async () => {
    currentUser = { id: "u-client", role: "CLIENT", email: "c@x" };
    prismaMock.projectAccess.findMany.mockResolvedValueOnce([{ projectId: "p1" }]);
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks"));
    expect(res.status).toBe(200);
    const whereArg = prismaMock.task.findMany.mock.calls[0]![0]!.where;
    expect(whereArg.initiative).toEqual({ projectId: { in: ["p1"] } });
  });

  it("CLIENT without ProjectAccess returns no tasks (empty IN list)", async () => {
    currentUser = { id: "u-client2", role: "CLIENT", email: "c2@x" };
    prismaMock.projectAccess.findMany.mockResolvedValueOnce([]);
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks"));
    expect(res.status).toBe(200);
    const whereArg = prismaMock.task.findMany.mock.calls[0]![0]!.where;
    expect(whereArg.initiative).toEqual({ projectId: { in: [] } });
  });

  it("VIEWER querying ?projectId=p2 without access → 403", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    // Need both mocks: the broad findMany (applies first) AND the projectId-specific findFirst.
    prismaMock.projectAccess.findMany.mockResolvedValueOnce([]);
    prismaMock.projectAccess.findFirst.mockResolvedValueOnce(null);
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks?projectId=p2"));
    expect(res.status).toBe(403);
  });

  it("OWNER querying ?projectId=p2 succeeds without project-access lookup", async () => {
    currentUser = { id: "u-owner", role: "OWNER", email: "o@x" };
    const GET = await importTasksGET();
    const res = await GET(makeRequest("http://t/api/tasks?projectId=p2"));
    expect(res.status).toBe(200);
    expect(prismaMock.projectAccess.findFirst).not.toHaveBeenCalled();
  });
});

// ---- GET /api/initiatives/[id]/messages -----------------------------------

describe("GET /api/initiatives/[id]/messages — tenant isolation", () => {
  it("returns 401 when unauthenticated and no internal secret", async () => {
    currentUser = null;
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/i1/messages"), fakeParams("i1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when initiative not found", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce(null);
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/iX/messages"), fakeParams("iX"));
    expect(res.status).toBe(404);
  });

  it("VIEWER without ProjectAccess → 403", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ projectId: "p1" });
    prismaMock.projectAccess.findUnique.mockResolvedValueOnce(null);
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/i1/messages"), fakeParams("i1"));
    expect(res.status).toBe(403);
  });

  it("VIEWER with ProjectAccess → 200", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ projectId: "p1" });
    prismaMock.projectAccess.findUnique.mockResolvedValueOnce({ id: "pa1" });
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/i1/messages"), fakeParams("i1"));
    expect(res.status).toBe(200);
  });

  it("OWNER → 200, no ProjectAccess lookup", async () => {
    currentUser = { id: "u-owner", role: "OWNER", email: "o@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ projectId: "p1" });
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/i1/messages"), fakeParams("i1"));
    expect(res.status).toBe(200);
    expect(prismaMock.projectAccess.findUnique).not.toHaveBeenCalled();
  });

  it("CLIENT with ProjectAccess → 200", async () => {
    currentUser = { id: "u-client", role: "CLIENT", email: "c@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ projectId: "p1" });
    prismaMock.projectAccess.findUnique.mockResolvedValueOnce({ id: "pa1" });
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/i1/messages"), fakeParams("i1"));
    expect(res.status).toBe(200);
  });

  it("CLIENT without ProjectAccess → 403", async () => {
    currentUser = { id: "u-client", role: "CLIENT", email: "c@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ projectId: "p1" });
    prismaMock.projectAccess.findUnique.mockResolvedValueOnce(null);
    const { GET } = await importMessagesRoute();
    const res = await GET(makeRequest("http://t/api/initiatives/i1/messages"), fakeParams("i1"));
    expect(res.status).toBe(403);
  });
});

// ---- POST /api/initiatives/[id]/messages ----------------------------------

describe("POST /api/initiatives/[id]/messages — tenant isolation", () => {
  it("VIEWER without ProjectAccess → 403", async () => {
    currentUser = { id: "u-viewer", role: "VIEWER", email: "v@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ id: "i1", projectId: "p1" });
    prismaMock.projectAccess.findUnique.mockResolvedValueOnce(null);

    const { POST } = await importMessagesRoute();
    const req = makeRequest("http://t/api/initiatives/i1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "info", content: "hello" }),
    });
    const res = await POST(req, fakeParams("i1"));
    expect(res.status).toBe(403);
    expect(prismaMock.initiativeMessage.create).not.toHaveBeenCalled();
  });

  it("OWNER can post (no ProjectAccess lookup)", async () => {
    currentUser = { id: "u-owner", role: "OWNER", email: "o@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ id: "i1", projectId: "p1" });
    prismaMock.initiativeMessage.create.mockResolvedValueOnce({ id: "m1" });

    const { POST } = await importMessagesRoute();
    const req = makeRequest("http://t/api/initiatives/i1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "info", content: "hello" }),
    });
    const res = await POST(req, fakeParams("i1"));
    expect(res.status).toBe(201);
    expect(prismaMock.projectAccess.findUnique).not.toHaveBeenCalled();
  });

  it("CLIENT with ProjectAccess can post", async () => {
    currentUser = { id: "u-client", role: "CLIENT", email: "c@x" };
    prismaMock.initiative.findUnique.mockResolvedValueOnce({ id: "i1", projectId: "p1" });
    prismaMock.projectAccess.findUnique.mockResolvedValueOnce({ id: "pa1" });
    prismaMock.initiativeMessage.create.mockResolvedValueOnce({ id: "m2" });

    const { POST } = await importMessagesRoute();
    const req = makeRequest("http://t/api/initiatives/i1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "info", content: "hello" }),
    });
    const res = await POST(req, fakeParams("i1"));
    expect(res.status).toBe(201);
  });
});
