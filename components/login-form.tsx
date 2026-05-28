"use client";

import { useState } from "react";
import { requestMagicLink } from "@/lib/auth/commands";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    const result = await requestMagicLink(email);
    if (result.success) {
      setStatus("sent");
    } else {
      setErrorMsg(result.error);
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
          <h2 className={cn(typography.cardTitle, "mb-1")}>Sign In</h2>
          <p className="mb-8 text-sm text-muted-foreground">
            Enter your email address to receive a sign-in link.
          </p>
          {status === "sent" ? (
            <div className="min-h-[105px] rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-medium text-green-900">
                Please check your email
              </p>
              <p className="mt-2 text-sm text-green-800">
                We have sent a sign-in link to{" "}
                <span className="font-medium">{email}</span>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className={cn(typography.label, "block text-foreground")}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-sm transition-all placeholder:text-muted-foreground focus:border-un-blue focus:ring-2 focus:ring-un-blue/20 focus:outline-none"
                />
              </div>
              {status === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">{errorMsg}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-lg bg-un-blue px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-un-blue/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "loading" ? "Sending..." : "Send sign-in link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
