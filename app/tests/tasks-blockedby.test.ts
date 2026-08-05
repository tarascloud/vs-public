/**
 * Unit тести для PUT /api/tasks/[id] — blockedBy dependency enforcement.
 *
 * Prisma, auth, rate-limit та callbacks замокані — тести НЕ торкаються БД.
 *
 * ВАЖЛИВО: станом на 2026-06-11 API НЕ enforce-ить blockedBy — задачу можна
 * перевести в IN_PROGRESS навіть якщо її blocker не DONE. CLAUDE.md правило
 * ("якщо blockedBy задачі не DONE — не починати") тримається лише на
 * дисципліні агентів. Перший тест фіксує поточну поведінку, другий (skip)
 * документує бажану.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi
    .fn()
    .mockResolvedValue({ id: "u1", role: "OWNER", email: "owner@test" }),
  requireAuthApi: vi.fn(),
  requireOwnerApi: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitOrNull: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/initiative-callback", () => ({
  fireInitiativeCallback: vi.fn().mockResolvedValue(undefined),
}));

import { PUT } from "@/app/api/tasks/[id]/route";

function putRequest(body: unknown) {
  return new Request("http://localhost:3000/api/tasks/task-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "task-1" }) };

const existingBlockedTask = {
  id: "task-1",
  status: "TODO",
  completionNote: null,
  acceptanceCriteria: null,
  verificationStatus: null,
  initiativeId: null,
  assigneeUserId: null,
};

const updatedTaskWithOpenBlocker = {
  id: "task-1",
  status: "IN_PROGRESS",
  title: "Blocked task",
  description: null,
  completionNote: null,
  commitHash: null,
  initiativeId: null,
  verificationStatus: null,
  verificationOutput: null,
  project: null,
  blockedBy: [
    { id: "task-0", ticketId: "T-0", title: "Blocker", status: "IN_PROGRESS" },
  ],
  blocking: [],
};

describe("PUT /api/tasks/[id] — blockedBy enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    prismaMock.task.findUnique.mockResolvedValue(existingBlockedTask);
    prismaMock.task.update.mockResolvedValue(updatedTaskWithOpenBlocker);
    prismaMock.task.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ПОТОЧНА ПОВЕДІНКА: дозволяє IN_PROGRESS попри не-DONE blocker (enforcement відсутній)", async () => {
    // Якщо цей тест впав бо API почав повертати 4xx — enforcement
    // реалізовано: видали цей тест і зніми skip з наступного.
    const res = await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("IN_PROGRESS");
    // route навіть не читає blockedBy перед update — жодного findUnique з include
    expect(prismaMock.task.findUnique).toHaveBeenCalledWith({
      where: { id: "task-1" },
    });
  });

  // TODO(vs): реалізувати blockedBy enforcement у PUT /api/tasks/[id]:
  // перед status → IN_PROGRESS читати blockedBy і повертати 409, якщо хоч
  // один blocker не DONE (з переліком блокерів у body). Після імплементації:
  // зняти .skip тут і видалити тест поточної поведінки вище.
  it.skip("БАЖАНА ПОВЕДІНКА: відхиляє IN_PROGRESS якщо blocker не DONE", async () => {
    const res = await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(res.status).toBe(409);
    expect(prismaMock.task.update).not.toHaveBeenCalled();
  });

  it("дозволяє IN_PROGRESS коли блокерів немає", async () => {
    prismaMock.task.update.mockResolvedValue({
      ...updatedTaskWithOpenBlocker,
      blockedBy: [],
    });

    const res = await PUT(putRequest({ status: "IN_PROGRESS" }), params);

    expect(res.status).toBe(200);
  });

  it("blockedByIds у body прокидається у prisma update як set", async () => {
    const res = await PUT(
      putRequest({ blockedByIds: ["task-0", "task-2"] }),
      params
    );

    expect(res.status).toBe(200);
    expect(prismaMock.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blockedBy: { set: [{ id: "task-0" }, { id: "task-2" }] },
        }),
      })
    );
  });
});
