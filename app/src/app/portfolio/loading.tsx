import { Skeleton } from "@/components/ui/skeleton";

export default function PortfolioLoading() {
  return (
    <main className="min-h-screen pt-24 pb-20">
      {/* Header skeleton */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-6 w-32 rounded-full mx-auto mb-6" />
          <Skeleton className="h-12 w-80 mx-auto mb-4" />
          <Skeleton className="h-5 w-96 mx-auto" />
        </div>
      </section>

      {/* Project grid skeleton */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-card-bg border border-card-border rounded-xl p-6 flex flex-col"
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-5">
                  <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                {/* Description */}
                <div className="space-y-2 mb-5">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
                {/* Tech stack */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-5 w-16 rounded" />
                  ))}
                </div>
                {/* CTA */}
                <Skeleton className="h-10 w-full rounded-lg mt-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
