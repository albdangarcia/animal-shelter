import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <div className="space-y-6">
      {/* Current Images card */}
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Current Images
          </CardTitle>
          <CardDescription>
            Manage the existing photos for this animal&apos;s profile. Hover
            over an image to delete it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Image grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upload card */}
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl">
            Upload New Images
          </CardTitle>
          <CardDescription>
            Add new photos to this animal&apos;s profile. Drag and drop images
            below or click to browse.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Uploader drop-zone placeholder */}
          <Skeleton className="h-62 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
};

export default Loading;