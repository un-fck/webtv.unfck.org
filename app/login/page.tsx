import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — UN Transcripts",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <LoginForm />
    </main>
  );
}
