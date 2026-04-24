export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function StatCardSkeleton() {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3.5"
          style={{ borderBottom: "1px solid var(--c-row-border)" }}
        >
          <Skeleton className="h-4 w-8 shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20 shrink-0" />
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}
