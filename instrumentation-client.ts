// Next.js client-side instrumentation. Runs once when the browser bundle boots.
// Initialises Sentry for the browser + mounts the user-feedback widget so
// people can report issues with a screenshot directly from the page.
//
// Session replay is intentionally NOT enabled: it can capture transcript text
// and speaker names, which is sensitive in a UN context.
import * as Sentry from "@sentry/nextjs";

// Skip Sentry in dev: keeps the dev bundle smaller and avoids the feedback
// widget showing up locally. Prod behaviour is unchanged.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_SENTRY_DSN
) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0,
    // Filter known noise: Kaltura player errors (third-party SDK, not our
    // bug), Microsoft Outlook SafeLink scanner ("Object Not Found Matching
    // Id"), and stale-client errors after a deploy (Server Action id no
    // longer exists in the new bundle). All actionable client errors still
    // come through.
    ignoreErrors: [
      /KalturaPlayerError/,
      /Object Not Found Matching Id:\d+, MethodName:/,
      /Server Action .* was not found on the server/,
    ],
    // The Kaltura player also raises UnhandledRejections whose value is an
    // *object* (not a string), so ignoreErrors can't see them. Drop any
    // rejection whose serialized value mentions a Kaltura player error
    // shape (the `errorDetails` / `category` keys are the giveaway).
    beforeSend(event) {
      const values = event.exception?.values ?? [];
      for (const ex of values) {
        const v = ex.value ?? "";
        if (
          v.includes("KalturaPlayerError") ||
          (v.includes("category") &&
            v.includes("errorDetails") &&
            v.includes("severity"))
        ) {
          return null;
        }
      }
      return event;
    },
    integrations: [
      Sentry.feedbackIntegration({
        colorScheme: "light",
        showBranding: false,
        // Match the site palette — UN blue for the primary action button.
        // The widget runs in a Shadow DOM so CSS vars from the host page
        // aren't visible; hardcode the hex matching --color-un-blue.
        themeLight: {
          accentBackground: "#009edb",
          accentForeground: "#ffffff",
          // Soft white halo so the widget reads as elevated against the
          // dark video player / page chrome behind it.
          boxShadow: "0 2px 12px rgba(255, 255, 255, 0.85)",
          borderRadius: "0.5rem",
        },
        // `triggerLabel` (not `buttonLabel`) is the right key for the
        // floating button text per @sentry/core FeedbackTextConfiguration.
        triggerLabel: "Give Feedback",
        triggerAriaLabel: "Open feedback form",
        formTitle: "Share feedback",
        submitButtonLabel: "Send",
        messagePlaceholder:
          "What's not working, confusing, or could be better?",
      }),
    ],
  });

  // Sentry's feedback widget has no `showIcon` option, so hide the megaphone
  // by injecting CSS into the widget's shadow root once it mounts. The host
  // element is `#sentry-feedback`; the trigger's icon is the inline <svg>.
  if (typeof window !== "undefined") {
    const hideIcon = (host: Element) => {
      const shadow = (host as HTMLElement).shadowRoot;
      if (!shadow || shadow.querySelector("style[data-feedback-icon-hide]"))
        return;
      const style = document.createElement("style");
      style.setAttribute("data-feedback-icon-hide", "");
      style.textContent =
        ".widget__actor { border-radius: 0.5rem; } " +
        ".widget__actor svg { display: none; } " +
        // On small screens Sentry hides the label, leaving an empty button.
        // Hide the trigger entirely below the Tailwind `sm` breakpoint.
        "@media (max-width: 639px) { .widget__actor { display: none; } }";
      shadow.appendChild(style);
    };
    const existing = document.getElementById("sentry-feedback");
    if (existing) hideIcon(existing);
    const observer = new MutationObserver(() => {
      const host = document.getElementById("sentry-feedback");
      if (host) {
        hideIcon(host);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// Required by Next 15+ for client-side router instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
