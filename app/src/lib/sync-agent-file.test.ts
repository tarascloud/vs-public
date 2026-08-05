import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

// We need to set AGENTS_DIR before importing the module, since it reads env at module load.
// Use a fresh temp dir per test.
let tmpAgentsDir: string;

beforeEach(async () => {
  tmpAgentsDir = await mkdtemp(path.join(tmpdir(), "sync-agent-file-test-"));
  process.env.AGENTS_DIR = tmpAgentsDir;
  // Force re-import so the module picks up the new AGENTS_DIR
  vi.resetModules();
});

afterEach(async () => {
  await rm(tmpAgentsDir, { recursive: true, force: true }).catch(() => {});
});

const baseAgent = {
  name: "tester",
  displayName: "Tester",
  description: "QA",
  role: "Test role",
  instructions: "Test instructions",
  tools: ["Read"],
  model: "sonnet",
};

describe("syncAgentToFile — agent name validation", () => {
  it("accepts a valid lowercase slug", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await syncAgentToFile({ ...baseAgent, name: "developer" });
    const content = await readFile(path.join(tmpAgentsDir, "developer.md"), "utf-8");
    expect(content).toContain("# Tester");
  });

  it("accepts slug with dashes and digits", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await syncAgentToFile({ ...baseAgent, name: "agent-1" });
    const content = await readFile(path.join(tmpAgentsDir, "agent-1.md"), "utf-8");
    expect(content).toContain("# Tester");
  });

  it("rejects path traversal '../etc/passwd'", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "../etc/passwd" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects absolute path '/etc/shadow'", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "/etc/shadow" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects name with slash 'a/b'", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "a/b" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects name starting with digit '1agent'", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "1agent" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects name with NUL byte", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "foo\0bar" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects empty name", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects name with uppercase 'Agent'", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: "Agent" }),
    ).rejects.toThrow(/Invalid agent name/);
  });

  it("rejects symlink-style hidden file '.htaccess'", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await expect(
      syncAgentToFile({ ...baseAgent, name: ".htaccess" }),
    ).rejects.toThrow(/Invalid agent name/);
  });
});

describe("syncAgentToFile — base dir confinement", () => {
  it("writes only inside AGENTS_DIR for valid name", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    await syncAgentToFile({ ...baseAgent, name: "developer" });
    const expectedPath = path.join(tmpAgentsDir, "developer.md");
    const content = await readFile(expectedPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("does not overwrite a file outside AGENTS_DIR via crafted name", async () => {
    const { syncAgentToFile } = await import("./sync-agent-file");
    // Pre-create a sibling file to make sure we don't touch it
    const sibling = path.join(path.dirname(tmpAgentsDir), "outside.md");
    await writeFile(sibling, "untouched", "utf-8");
    try {
      await expect(
        syncAgentToFile({ ...baseAgent, name: "../outside" }),
      ).rejects.toThrow();
      const after = await readFile(sibling, "utf-8");
      expect(after).toBe("untouched");
    } finally {
      await rm(sibling, { force: true });
    }
  });
});
