"use client";

interface SkeletonProps {
  count?: number;
  className?: string;
}

export function SkeletonTableRow({ count = 1, className = "" }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-t border-slate-100">
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="p-3">
              <div className={`h-5 bg-slate-200 rounded animate-pulse ${className}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCard({ count = 3 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white p-4 shadow-sm border border-slate-200 space-y-3"
        >
          <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3" />
          <div className="h-6 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
        </div>
      ))}
    </>
  );
}

export function SkeletonText({ className = "" }: { className?: string }) {
  return <div className={`h-4 bg-slate-200 rounded animate-pulse ${className}`} />;
}
