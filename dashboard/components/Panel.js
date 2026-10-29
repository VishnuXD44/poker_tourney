/** A dashboard section styled like a card: numbered title, optional right-hand note. */
export default function Panel({ index, title, aside, children, className = "" }) {
  return (
    <section className={`panel p-5 sm:p-6 ${className}`}>
      <header className="flex items-baseline justify-between gap-4 mb-5 pb-3 border-b border-line">
        <h2 className="text-xs uppercase tracking-[0.18em] text-ink">
          {index && <span className="text-muted mr-3">{index}</span>}
          {title}
        </h2>
        {aside && <span className="text-xs text-muted truncate">{aside}</span>}
      </header>
      {children}
    </section>
  );
}
