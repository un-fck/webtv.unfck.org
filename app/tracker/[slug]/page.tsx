import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTrackedItemBySlug } from '@/lib/sentiment-db';
import { TrackerItemDetail } from '@/components/tracker-item-detail';

export const dynamic = 'force-dynamic';

export default async function TrackerItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getTrackedItemBySlug(slug);

  if (!item) {
    notFound();
  }

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

        <TrackerItemDetail item={item} />
      </div>
    </main>
  );
}
