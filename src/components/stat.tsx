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
    <div className="card flex flex-col gap-1 p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`num text-right text-[1.6rem] font-bold leading-tight tracking-tight ${color}`}>{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
