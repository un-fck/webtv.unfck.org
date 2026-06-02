import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware versions of next.js navigation primitives. Internal links and
// programmatic navigation MUST use these so the active locale stays in the
// URL when the user moves between pages.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
