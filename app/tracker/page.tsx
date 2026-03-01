import Image from 'next/image';
import Link from 'next/link';
import { TrackerDashboard } from '@/components/tracker-dashboard';

export const dynamic = 'force-dynamic';

export default function TrackerPage() {
  return (
    <main className="min-h-screen bg-background px-4 sm:px-6">
      <div className="max-w-[1200px] mx-auto py-8">
        <Image
          src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
          alt="UN Logo"
          width={200}
          height={40}
          className="h-10 w-auto mb-6"
        />

        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
          &larr; Back to Schedule
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-semibold mb-1">Undercurrents</h1>
          <p className="text-muted-foreground">
            Track how positions evolve across UN meetings. Monitor sentiment on topics, resolution articles, and proposals over time.
          </p>
        </header>

        <TrackerDashboard />
      </div>
    </main>
  );
}
