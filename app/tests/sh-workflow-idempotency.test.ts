/**
 * Unit тести для POST /api/internal/sh-workflow — idempotency.
 *
 * Prisma замокана — тести НЕ торкаються БД. SH worker ретраїть виклики,
 * тому повторний POST з тим самим sessionNumber НЕ повинен створювати
 * дублікати initiative/tasks — лише повертати існуючий mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    agent: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    initiative: { findUnique: vi.fn(), create: vi.fn() },
    task: { createManyAndReturn: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "@/app/api/internal/sh-workflow/route";

const SECRET = "test-internal-secret";

function postRequest(body: unknown, secret: string | null = SECRET) {
  return new Request("http://localhost:3000/api/internal/sh-workflow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-internal-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  sessionId: 42,
  sessionNumber: 5,
  title: "Тестовая сессия",
  steps: [
    { stepKey: "transcribe", title: "Транскрипция" },
    { stepKey: "materials", title: "Материалы", dependsOn: ["transcribe"] },
  ],
};

describe("POST /api/internal/sh-workflow — idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    vi.stubEnv("OWNER_EMAIL", "owner@test");
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1" });
    prismaMock.agent.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.project.findFirst.mockResolvedValue({ id: "p1" });
    prismaMock.$transaction.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("без internal secret → 401, нічого не створює", async () => {
    const res = await POST(postRequest(validBody, null));

    expect(res.status).toBe(401);
    expect(prismaMock.initiative.create).not.toHaveBeenCalled();
  });

  it("з невірним secret → 401", async () => {
    const res = await POST(postRequest(validBody, "wrong-secret"));

    expect(res.status).toBe(401);
    expect(prismaMock.initiative.create).not.toHaveBeenCalled();
  });

  it("перший виклик: створює initiative + tasks, повертає 201 з mapping", async () => {
    prismaMock.initiative.findUnique.mockResolvedValue(null);
    prismaMock.initiative.create.mockResolvedValue({ id: "init-sh-session-5" });
    prismaMock.task.createManyAndReturn.mockResolvedValue([
      { id: "t1", ticketId: "SH-S5-01" },
      { id: "t2", ticketId: "SH-S5-02" },
    ]);

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.initiativeId).toBe("init-sh-session-5");
    expect(body.tasks).toEqual({ transcribe: "t1", materials: "t2" });
    expect(prismaMock.initiative.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.task.createManyAndReturn).toHaveBeenCalledTimes(1);
    // dependsOn: materials blocked by transcribe → 1 update у транзакції
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("повторний виклик (initiative існує): existing=true, дублікати НЕ створюються", async () => {
    prismaMock.initiative.findUnique.mockResolvedValue({
      id: "init-sh-session-5",
      tasks: [
        { id: "t1", ticketId: "SH-S5-01", title: "Транскрипция" },
        { id: "t2", ticketId: "SH-S5-02", title: "Материалы" },
      ],
    });

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.existing).toBe(true);
    expect(body.initiativeId).toBe("init-sh-session-5");
    expect(body.tasks).toEqual({ transcribe: "t1", materials: "t2" });
    expect(prismaMock.initiative.create).not.toHaveBeenCalled();
    expect(prismaMock.task.createManyAndReturn).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("невалідне body → 400, нічого не створює", async () => {
    const res = await POST(postRequest({ sessionNumber: 5, steps: [] }));

    expect(res.status).toBe(400);
    expect(prismaMock.initiative.create).not.toHaveBeenCalled();
  });
});
