import { Skeleton } from "@/components/ui/skeleton";

export default function StudioLoading() {
  return (
    <main className="flex flex-col min-h-screen pt-[calc(5rem+2.5rem)] md:pt-20">
      <section className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Search bar skeleton */}
          <div className="mb-6">
            <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
          </div>

          {/* Idea input skeleton */}
          <div className="mb-8">
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>

          {/* Initiative cards skeleton */}
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-card-bg border border-card-border rounded-xl p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="flex gap-2 mt-3">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
