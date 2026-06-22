interface PageLayoutProps {
  children: React.ReactNode;
}

const PageLayout = ({ children }: PageLayoutProps) => {
  return (
    <div className="antialiased">
      <div className="max-w-4xl w-full mx-auto p-8">
        {children}
      </div>
    </div>
  );
};

export default PageLayout;