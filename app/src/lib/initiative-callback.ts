import { prisma } from "@/lib/prisma";

/**
 * Fire-and-forget POST to initiative's callbackUrl.
 * Used to notify external systems (e.g. Shuleansky) about initiative lifecycle events.
 */
export async function fireInitiativeCallback(
  initiativeId: string,
  event: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const initiative = await prisma.initiative.findUnique({
      where: { id: initiativeId },
      select: { callbackUrl: true },
    });
    if (!initiative?.callbackUrl) return;

    const secret = process.env.INTERNAL_API_SECRET;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(initiative.callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret && { "x-internal-secret": secret }),
      },
      body: JSON.stringify({ event, initiativeId, ...payload }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    console.error(`[initiative-callback] ${event} for ${initiativeId}:`, err);
  }
}
