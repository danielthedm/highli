export function SectionHeader({
  id,
  kicker,
  title,
  note,
}: {
  id: string;
  kicker: string;
  title: string;
  note: string;
}) {
  return (
    <header className="section-heading">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2 id={id} className="section-title">
          {title}
        </h2>
      </div>
      <p className="section-note">{note}</p>
    </header>
  );
}
