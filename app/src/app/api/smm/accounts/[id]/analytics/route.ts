import { prisma } from "@/lib/prisma";
import { requireOwnerApi } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const _gate = await requireOwnerApi();
  if (!_gate.authorized) return _gate.response;
  try {
    const { id } = await params;
    const account = await prisma.smmAccount.findUnique({
      where: { id },
      select: { id: true, platform: true, accountName: true, analytics: true },
    });

    if (!account) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    // Return cached analytics or placeholder structure
    const analytics = account.analytics ?? {
      subscribers: null,
      views: null,
      engagement: null,
      lastSync: null,
      note: "Analytics coming soon. Connect your platform API to see metrics here.",
    };

    return Response.json({ accountId: id, platform: account.platform, analytics });
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
    return Response.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
