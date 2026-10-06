export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "bad";
}) {
  const color = tone === "good" ? "text-brand" : tone === "bad" ? "text-danger" : "";
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className={`num mt-1 text-right text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
