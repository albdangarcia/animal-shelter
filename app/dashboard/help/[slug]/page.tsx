import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GuideMarkdown } from "@/components/dashboard/help/guide-markdown";
import { getVisibleGuides } from "@/app/lib/data/guides.data";
import { HELP_PATH, helpGuidePath } from "@/app/lib/guides/help-paths";
import { findVisibleGuide, visibleRelated } from "@/app/lib/guides/visibility";
import { calendarDay, formatShelterDay } from "@/app/lib/utils/shelter-day";

const Page = async ({ params }: PageProps<"/dashboard/help/[slug]">) => {
  const { slug } = await params;
  const visible = await getVisibleGuides();
  const guide = findVisibleGuide(visible, slug);
  // A guide this reader can't see is answered exactly like one that doesn't
  // exist, so the URL says nothing about it.
  if (!guide) notFound();

  const related = visibleRelated(guide, visible);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={HELP_PATH}
        className="text-muted-foreground flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All guides
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>{guide.title}</h1>
          </CardTitle>
          <CardDescription>{guide.summary}</CardDescription>
          <p className="text-muted-foreground text-xs">
            Last checked {formatShelterDay(calendarDay(guide.verified))}
          </p>
        </CardHeader>
        <CardContent>
          <article aria-label={guide.title}>
            <GuideMarkdown body={guide.body} />
          </article>
        </CardContent>
      </Card>
      {related.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="related-guides">Related guides</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul aria-labelledby="related-guides" className="space-y-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={helpGuidePath(item.slug)}
                    className="font-medium hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {item.summary}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Page;
