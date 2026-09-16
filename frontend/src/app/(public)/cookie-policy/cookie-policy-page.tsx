import Link from "next/link";
import { APP_CONFIG } from "@/config";

const lastUpdated = "May 27, 2026";

const cookies = [
  {
    name: "__access",
    purpose:
      "Short-lived signed JWT that authenticates each request while you are using the site.",
    duration: "15 minutes (HTTP-only, secure)",
    type: "Strictly necessary",
  },
  {
    name: "__refresh",
    purpose:
      "Opaque UUID used as a lookup key for your refresh token, which is stored server-side in Redis. Allows the short-lived access token to be renewed without making you sign in again.",
    duration: "7 days (HTTP-only, secure)",
    type: "Strictly necessary",
  },
] as const;

export function CookiePolicyPage() {
  return (
    <main className="relative mx-auto max-w-3xl px-5 py-14 md:px-8 md:py-20">
      <header className="mb-10 space-y-2 border-b border-border/60 pb-8">
        <p className="font-display text-[11px] font-semibold tracking-wide-label text-primary uppercase">
          Legal
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight-display text-balance text-foreground md:text-4xl">
          Cookie Policy
        </h1>
        <p className="font-numeric text-xs text-muted-foreground">
          Last updated: {lastUpdated}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          What are cookies?
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cookies are small text files placed on your device by the websites you
          visit. They are widely used to make sites work, or work more
          efficiently, and to provide information to the site owner.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          Cookies we use
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {APP_CONFIG.name} uses{" "}
          <strong>only strictly necessary cookies</strong>. These cookies are
          required for the site to function and to keep your session secure. We
          do <strong>not</strong> use cookies for analytics, advertising,
          profiling, or third-party tracking.
        </p>

        <div className="mt-2 overflow-x-auto rounded-xl border border-border/60 bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-[11px] tracking-wide-label text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-4 py-2.5 font-semibold">Purpose</th>
                <th className="px-4 py-2.5 font-semibold">Duration</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((c) => (
                <tr
                  key={c.name}
                  className="border-t border-border/60 align-top"
                >
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-foreground">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.purpose}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.duration}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {c.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          Third-party cookies
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          None. {APP_CONFIG.name} does not embed third-party services that set
          cookies on your device.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          Managing cookies
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Because the cookies we set are strictly necessary, there is no consent
          toggle to offer: disabling them would prevent you from signing in. You
          can clear cookies at any time through your browser settings, but doing
          so will sign you out.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          Changes to this policy
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If our cookie practices change, we will update this page and revise
          the date above.
        </p>
      </section>

      <footer className="mt-12 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        Questions? See our{" "}
        <Link
          href="/"
          className="font-medium text-primary underline underline-offset-2 hover:text-foreground"
        >
          home page
        </Link>{" "}
        for contact details.
      </footer>
    </main>
  );
}
