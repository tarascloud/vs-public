/**
 * Unit тести для PUT /api/initiatives/[id] — status transitions.
 *
 * Prisma, auth та callbacks замокані — тести НЕ торкаються БД.
 * Координаційний критичний шлях "роби" workflow: PLANNING → IN_PROGRESS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { prismaMock, requireOwnerApiMock } = vi.hoisted(() => ({
  prismaMock: {
    initiative: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
  },
  requireOwnerApiMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireOwnerApi: (...args: unknown[]) => requireOwnerApiMock(...args),
}));
vi.mock("@/lib/initiative-callback", () => ({
  fireInitiativeCallback: vi.fn().mockResolvedValue(undefined),
}));

import { PUT } from "@/app/api/initiatives/[id]/route";

function putRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/initiatives/init-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "init-1" }) };

describe("PUT /api/initiatives/[id] — status transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
    // Telegram notify fetch — не повинен ходити в мережу
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    // Owner за замовчуванням авторизований
    requireOwnerApiMock.mockResolvedValue({
      authorized: true,
      user: { id: "u1", role: "OWNER", email: "owner@test" },
      email: "owner@test",
    });
    prismaMock.task.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("PLANNING → IN_PROGRESS: оновлює статус і повертає 200", async () => {
    prismaMock.initiative.findUnique.mockResolvedValue({
      id: "init-1",
      status: "PLANNING",
    });
    prismaMock.initiative.update.mockResolvedValue({
      id: "init-1",
      status: "IN_PROGRESS",
      tasks: [],
      messages: [],
    });

    const res = await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("IN_PROGRESS");
    expect(prismaMock.initiative.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "init-1" },
        data: expect.objectContaining({ status: "IN_PROGRESS" }),
      })
    );
  });

  it("на зміну статусу шле Telegram notify (fire-and-forget)", async () => {
    prismaMock.initiative.findUnique.mockResolvedValue({
      id: "init-1",
      status: "PLANNING",
    });
    prismaMock.initiative.update.mockResolvedValue({
      id: "init-1",
      status: "IN_PROGRESS",
      tasks: [],
      messages: [],
    });

    await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/telegram/notify"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("без зміни статусу Telegram notify НЕ шле", async () => {
    prismaMock.initiative.findUnique.mockResolvedValue({
      id: "init-1",
      status: "IN_PROGRESS",
    });
    prismaMock.initiative.update.mockResolvedValue({
      id: "init-1",
      status: "IN_PROGRESS",
      tasks: [],
      messages: [],
    });

    await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("невалідний статус → 400, update не викликається", async () => {
    const res = await PUT(putRequest({ status: "NOT_A_STATUS" }), params);

    expect(res.status).toBe(400);
    expect(prismaMock.initiative.update).not.toHaveBeenCalled();
  });

  it("initiative не знайдено → 404", async () => {
    prismaMock.initiative.findUnique.mockResolvedValue(null);

    const res = await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(res.status).toBe(404);
    expect(prismaMock.initiative.update).not.toHaveBeenCalled();
  });

  it("без auth і без internal secret → 401", async () => {
    requireOwnerApiMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(res.status).toBe(401);
    expect(prismaMock.initiative.update).not.toHaveBeenCalled();
  });

  it("валідний x-internal-secret обходить owner auth", async () => {
    requireOwnerApiMock.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    prismaMock.initiative.findUnique.mockResolvedValue({
      id: "init-1",
      status: "PLANNING",
    });
    prismaMock.initiative.update.mockResolvedValue({
      id: "init-1",
      status: "IN_PROGRESS",
      tasks: [],
      messages: [],
    });

    const res = await PUT(
      putRequest(
        { status: "IN_PROGRESS" },
        { "x-internal-secret": "test-internal-secret" }
      ),
      params
    );

    expect(res.status).toBe(200);
    expect(requireOwnerApiMock).not.toHaveBeenCalled();
  });
});
