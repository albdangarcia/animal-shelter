interface PageLayoutProps {
  children: React.ReactNode;
}

/**
 * The standard public-page container. The group layout is full-bleed — bands run
 * to the viewport edge — so every page supplies its own gutters and max width.
 */
const PageLayout = ({ children }: PageLayoutProps) => {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-14">
      {children}
    </div>
  );
};

export default PageLayout;
