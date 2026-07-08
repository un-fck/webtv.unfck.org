// Next.js client-side instrumentation. Runs once when the browser bundle boots.
// Initialises Sentry for the browser + mounts the user-feedback widget so
// people can report issues with a screenshot directly from the page.
//
// Session replay is intentionally NOT enabled: it can capture transcript text
// and speaker names, which is sensitive in a UN context.
import * as Sentry from "@sentry/nextjs";

import { shouldDropClientEvent } from "@/lib/sentry-filter";

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
    // Filter known noise from external actors we can't fix: Microsoft Outlook
    // SafeLink scanner ("Object Not Found Matching Id") and stale-client
    // errors after a deploy (Server Action id no longer exists in the new
    // bundle). Kaltura player errors are handled at the source — see
    // `reportKalturaError` in components/video-player.tsx.
    ignoreErrors: [
      /Object Not Found Matching Id:\d+, MethodName:/,
      /Server Action .* was not found on the server/,
    ],
    // Drop a small set of known-unactionable client errors by *signature*
    // (not by error type): exceptions thrown inside Kaltura's third-party
    // player bundle (TRANSCRIPTS-2K `e.charAt`, 2A `e.ownerNode.id`) and the
    // blocked-localStorage SecurityError in privacy/sandboxed contexts
    // (TRANSCRIPTS-2F). The decision lives in `lib/sentry-filter.ts` so it
    // can be unit-tested without a browser.
    beforeSend(event) {
      return shouldDropClientEvent(event) ? null : event;
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
          // No box shadow — the previous soft white halo read as an odd glow
          // around the trigger button and dialog.
          boxShadow: "none",
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
        // Name and email are optional (Sentry's `isNameRequired` /
        // `isEmailRequired` both default to false). Sentry only marks
        // *required* fields — optional ones get no marker — so spell out
        // "(optional)" in the labels to make it clear people can skip them.
        nameLabel: "Name (optional)",
        emailLabel: "Email (optional)",
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
        // Sentry renders the "(required)" marker in a separate span shrunk to
        // 0.85em, while our "(optional)" labels are plain full-size label
        // text. Force the required marker back to 1em so both parentheticals
        // render in the same font.
        ".form__label__text--required { font-size: 1em; } " +
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
