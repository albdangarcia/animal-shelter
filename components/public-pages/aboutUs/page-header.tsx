interface Props {
  title: string;
  description?: string;
  as?: "page" | "section";
}

const PublicPageHeader = ({ title, description, as = "page" }: Props) => {
  if (as === "section") {
    return (
      <div className="mb-6 flex items-center gap-3">
        <h2 className="font-display text-[24px] whitespace-nowrap text-foreground">
          {title}
        </h2>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <div className="text-left">
      {/* clamp rather than a breakpoint jump — 56px overflows a 320px phone. */}
      <h1 className="font-display text-[clamp(38px,6vw,56px)] text-foreground">
        {title}
      </h1>
      {description && (
        <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
};

export default PublicPageHeader;
