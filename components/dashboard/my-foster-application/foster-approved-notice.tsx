import Link from "next/link";
import { PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function FosterApprovedNotice() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          You&apos;re an approved foster
        </CardTitle>
        <CardDescription>
          Your foster profile is active — no need to apply again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <PawPrint className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm max-w-sm">
          Thanks for being a foster! Head over to My Foster Animals to see
          who&apos;s currently in your care.
        </p>
        <Button asChild size="sm">
          <Link href="/dashboard/my-foster-animals">
            Go to My Foster Animals
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
