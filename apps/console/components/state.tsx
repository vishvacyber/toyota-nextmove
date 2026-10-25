/** Loading / error line shared by the C1 pages. */
export function ApiState({ loading, error }: { loading: boolean; error?: Error }) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error.message}</p>;
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return null;
}
