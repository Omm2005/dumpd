export default function OfflinePage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm rounded-[2rem] border border-border bg-card/90 p-8 text-center shadow-sm backdrop-blur">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground">
          d
        </div>
        <h1 className="text-2xl font-heading font-semibold text-foreground">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          dumpd is installed, but this view needs a connection right now. Reconnect and reload to continue.
        </p>
      </div>
    </main>
  );
}
