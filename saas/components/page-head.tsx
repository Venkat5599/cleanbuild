import type { ReactNode } from 'react';

export function PageHead({
  title,
  lede,
  meta,
}: {
  title: string;
  lede: string;
  meta?: ReactNode;
}): ReactNode {
  return (
    <header className="border-border mb-8 flex flex-wrap items-baseline justify-between gap-4 border-b pb-6">
      <div>
        <h1 className="text-foreground text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
        <p className="text-muted-foreground mt-2 max-w-[62ch] leading-relaxed">{lede}</p>
      </div>
      {meta && <p className="text-muted-foreground font-mono text-xs">{meta}</p>}
    </header>
  );
}

export function Empty({ title, body }: { title: string; body: string }): ReactNode {
  return (
    <div className="bg-card-secondary text-card-foreground-muted rounded-4xl p-8">
      <p className="text-card-foreground font-medium">{title}</p>
      <p className="mt-2 max-w-[56ch] text-sm leading-relaxed">{body}</p>
    </div>
  );
}
