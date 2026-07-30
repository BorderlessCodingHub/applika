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
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Cookie Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: {lastUpdated}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What are cookies?</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cookies are small text files placed on your device by the websites you
          visit. They are widely used to make sites work, or work more
          efficiently, and to provide information to the site owner.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Cookies we use</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {APP_CONFIG.name} uses{" "}
          <strong>only strictly necessary cookies</strong>. These cookies are
          required for the site to function and to keep your session secure. We
          do <strong>not</strong> use cookies for analytics, advertising,
          profiling, or third-party tracking.
        </p>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((c) => (
                <tr key={c.name} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
                  <td className="px-3 py-2">{c.purpose}</td>
                  <td className="px-3 py-2">{c.duration}</td>
                  <td className="px-3 py-2">{c.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Third-party cookies</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          None. {APP_CONFIG.name} does not embed third-party services that set
          cookies on your device.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Managing cookies</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Because the cookies we set are strictly necessary, there is no consent
          toggle to offer: disabling them would prevent you from signing in. You
          can clear cookies at any time through your browser settings, but doing
          so will sign you out.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">Changes to this policy</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If our cookie practices change, we will update this page and revise
          the date above.
        </p>
      </section>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        Questions? See our{" "}
        <Link
          href="/"
          className="underline underline-offset-2 hover:text-foreground"
        >
          home page
        </Link>{" "}
        for contact details.
      </footer>
    </main>
  );
}
