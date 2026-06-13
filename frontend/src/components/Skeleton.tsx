export function AnswerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-2/3" />
      </div>
      <div className="card space-y-3 p-4">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-3 w-full" />
        <div className="flex gap-4">
          <div className="skeleton h-8 flex-1" />
          <div className="skeleton h-8 flex-1" />
          <div className="skeleton h-8 flex-1" />
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card space-y-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-8 w-full" />
      ))}
    </div>
  );
}
