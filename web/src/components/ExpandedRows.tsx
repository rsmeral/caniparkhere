/** The price/cap/hours rows a zone reveals when its card is open. */
export function ExpandedRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="app__detail-expanded">
      {rows.map((row) => (
        <div className="app__detail-expanded-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
