import { prisma } from "@/lib/prisma";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { requireOwnerApi, verifyInternalSecret } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const AGENTS_DIR = join(process.cwd(), "..", "agents");

// Emoji mapping for avatarEmoji field
const AGENT_EMOJIS: Record<string, string> = {
  architect: "\u{1F3D7}\u{FE0F}",
  developer: "\u{1F4BB}",
  "product-owner": "\u{1F3AF}",
  tester: "\u{1F9EA}",
  security: "\u{1F6E1}\u{FE0F}",
  devops: "\u{2699}\u{FE0F}",
  "network-engineer": "\u{1F310}",
  "release-manager": "\u{1F680}",
  accountant: "\u{1F4CA}",
  trader: "\u{1F4C8}",
  smm: "\u{1F4F1}",
  ceo: "\u{1F451}",
  cat: "\u{1F431}",
  devsecops: "\u{1F6E1}\u{FE0F}",
  coo: "\u{1F451}",
  designer: "\u{1F3A8}",
};

// Color mapping for color field (Tailwind gradient classes)
const AGENT_COLORS: Record<string, string> = {
  architect: "from-purple-500 to-violet-600",
  developer: "from-blue-500 to-cyan-600",
  tester: "from-green-500 to-emerald-600",
  devsecops: "from-orange-500 to-amber-600",
  security: "from-orange-500 to-amber-600",
  trader: "from-pink-500 to-rose-600",
  smm: "from-teal-500 to-cyan-600",
  coo: "from-indigo-500 to-blue-600",
  ceo: "from-indigo-500 to-blue-600",
  cat: "from-yellow-500 to-amber-600",
  designer: "from-fuchsia-500 to-pink-600",
  devops: "from-blue-500 to-indigo-600",
  "product-owner": "from-purple-500 to-pink-600",
  "network-engineer": "from-teal-500 to-green-600",
  "release-manager": "from-rose-500 to-pink-600",
  accountant: "from-slate-500 to-gray-600",
};

// Display name mapping
const DISPLAY_NAMES: Record<string, string> = {
  architect: "Architect",
  developer: "Developer",
  "product-owner": "Product Owner",
  tester: "Tester",
  security: "Security",
  devops: "DevOps",
  "network-engineer": "Network Engineer",
  "release-manager": "Release Manager",
  accountant: "Accountant",
  trader: "Trader",
  smm: "SMM",
  ceo: "CEO",
  cat: "Cat",
  designer: "Dizi",
};

interface ParsedAgent {
  name: string;
  description: string;
  subagent_type: string;
  model: string;
  tools: string[];
  instructions: string;
}

function parseFrontmatter(content: string): ParsedAgent {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error("No frontmatter found");
  }

  const frontmatter = frontmatterMatch[1];
  const instructions = frontmatterMatch[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*"(.+)"$/m);
  const typeMatch = frontmatter.match(/^subagent_type:\s*(.+)$/m);
  const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
  const toolsMatch = frontmatter.match(/^tools:\s*\[(.+)\]$/m);

  return {
    name: nameMatch?.[1]?.trim() || "",
    description: descMatch?.[1]?.trim() || "",
    subagent_type: typeMatch?.[1]?.trim() || "",
    model: modelMatch?.[1]?.trim() || "sonnet",
    tools: toolsMatch?.[1]?.split(",").map((t) => t.trim()) || [],
    instructions,
  };
}

export async function POST(request: Request) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  const user = _gate.user;
  if (!verifyInternalSecret(request, "SEED_SECRET", "x-seed-secret")) {
    return Response.json({ error: "Invalid seed secret" }, { status: 403 });
  }

  try {
    const files = await readdir(AGENTS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const results: { name: string; status: "created" | "updated" | "error"; error?: string }[] = [];

    for (const file of mdFiles) {
      const filePath = join(AGENTS_DIR, file);
      try {
        const content = await readFile(filePath, "utf-8");
        const parsed = parseFrontmatter(content);
        const slug = file.replace(".md", "");

        const displayName = DISPLAY_NAMES[slug] || parsed.name;
        const avatarEmoji = AGENT_EMOJIS[slug] || undefined;
        const color = AGENT_COLORS[slug] || undefined;

        const existing = await prisma.agent.findUnique({
          where: { name: slug },
        });

        if (existing) {
          await prisma.agent.update({
            where: { name: slug },
            data: {
              displayName,
              description: parsed.description,
              role: parsed.subagent_type,
              instructions: parsed.instructions,
              tools: parsed.tools,
              model: parsed.model,
              ...(avatarEmoji !== undefined && { avatarEmoji }),
              ...(color !== undefined && { color }),
            },
          });
          results.push({ name: slug, status: "updated" });
        } else {
          await prisma.agent.create({
            data: {
              name: slug,
              displayName,
              description: parsed.description,
              role: parsed.subagent_type,
              instructions: parsed.instructions,
              tools: parsed.tools,
              model: parsed.model,
              ...(avatarEmoji !== undefined && { avatarEmoji }),
              ...(color !== undefined && { color }),
            },
          });
          results.push({ name: slug, status: "created" });
        }
      } catch (err) {
        results.push({
          name: file,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return Response.json({
      message: `Seeded ${results.filter((r) => r.status !== "error").length} agents from ${mdFiles.length} files`,
      results,
    });
  } catch (error) {
    console.error("Failed to seed agents:", error);
    return Response.json({ error: "Failed to seed agents" }, { status: 500 });
  }
}
