// Next.js client-side instrumentation. Runs once when the browser bundle boots.
// Initialises Sentry for the browser + mounts the user-feedback widget so
// people can report issues with a screenshot directly from the page.
//
// Session replay is intentionally NOT enabled: it can capture transcript text
// and speaker names, which is sensitive in a UN context.
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0,
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
        },
        // Override the bug-oriented defaults so the widget reads as general
        // feedback. Option names per @sentry/core FeedbackTextConfiguration —
        // `triggerLabel` (not `buttonLabel`) is the right key for the
        // floating button text.
        triggerLabel: "Feedback",
        triggerAriaLabel: "Open feedback form",
        formTitle: "Share feedback",
        submitButtonLabel: "Send",
        messagePlaceholder:
          "What's not working, confusing, or could be better?",
      }),
    ],
  });
}

// Required by Next 15+ for client-side router instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
