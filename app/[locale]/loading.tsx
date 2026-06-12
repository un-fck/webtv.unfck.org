export default function Loading() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center gap-3 px-6 text-muted-foreground"
    >
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>Loading…</span>
    </main>
  );
}
