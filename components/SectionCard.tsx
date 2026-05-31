import type { ReactNode } from "react";

type Props = {
  title?: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  compact?: boolean;
};

export default function SectionCard({
  title,
  description,
  right,
  children,
  className = "",
  compact = false,
}: Props) {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900/95 shadow-lg shadow-black/10 ${
        compact ? "p-4" : "p-4 md:p-6"
      } ${className}`}
    >
      {(title || description || right) && (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            {title && <h2 className="text-xl font-bold md:text-2xl">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm text-slate-400 md:text-base">
                {description}
              </p>
            )}
          </div>

          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}

      {children}
    </section>
  );
}