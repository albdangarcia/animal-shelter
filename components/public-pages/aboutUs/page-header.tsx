interface Props {
  title: string;
  description?: string;
  as?: "page" | "section";
}

const PublicPageHeader = ({ title, description, as = "page" }: Props) => {
  if (as === "section") {
    return (
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground tracking-tight whitespace-nowrap">
          {title}
        </h2>
        <span className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return (
    <div className="text-left">
      <h1 className="text-4xl font-semibold text-foreground tracking-tight">
        {title}
      </h1>
      {description && (
        <p className="mt-5 text-muted-foreground tracking-wide leading-relaxed max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
};

export default PublicPageHeader;