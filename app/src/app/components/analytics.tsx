import { prisma } from "@/lib/prisma";

export async function Analytics() {
  let ga4Id = "";
  try {
    const project = await prisma.project.findFirst({
      where: { slug: "vibe-studio", ga4MeasurementId: { not: null } },
      select: { ga4MeasurementId: true },
    });
    ga4Id = project?.ga4MeasurementId || "";
  } catch {
    // DB not available yet
  }

  if (!ga4Id || !/^G-[A-Z0-9]+$/.test(ga4Id)) return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`,
        }}
      />
    </>
  );
}
