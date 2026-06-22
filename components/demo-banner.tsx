import { Info } from "lucide-react";
import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const GITHUB_REPO_URL = "https://github.com/albdangarcia/animal-shelter";

const DemoBanner = () => {
  return (
    <div
      role="alert"
      className="w-full border-b bg-card p-3 text-card-foreground"
    >
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 sm:flex-row">
        {/* Message Content */}
        <div className="flex items-center gap-3 text-sm">
          <Info className="h-5 w-5 shrink-0" />
          <div className="text-center sm:text-left">
            <p className="font-semibold">Heads Up!</p>
            <p className="text-muted-foreground">
              This is a portfolio demo. Data is for demonstration purposes only.
            </p>
          </div>
        </div>

        {/* GitHub Button */}
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap"
          >
            <IconBrandGithub className="mr-2 h-4 w-4" />
            View on GitHub
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default DemoBanner;
