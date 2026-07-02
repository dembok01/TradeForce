export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-primary/80">
          {eyebrow}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
