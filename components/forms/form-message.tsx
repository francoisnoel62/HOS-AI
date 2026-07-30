export function FormMessage({ error }: { error?: string }) {
  if (!error) return null;
  const message = error === "invalid"
    ? "Please review the required fields and try again."
    : error === "unavailable"
      ? "The local submission service is not available. Confirm Docker Postgres and local configuration, then try again."
      : "This form is unavailable.";
  return <div className="mb-6 border-l-2 border-[var(--danger)] bg-[color:var(--danger)/0.08] p-4 text-sm" role="alert">{message}</div>;
}
