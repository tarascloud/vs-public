import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ projectSlug: string }>;
}

export default async function ClientProjectRedirectPage({ params }: Props) {
  const { projectSlug } = await params;
  redirect(`/client/${projectSlug}/dashboard`);
}
