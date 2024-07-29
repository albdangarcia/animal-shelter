import Footer from "../ui/footer";
import TopNavWrapper from "../ui/top-nav-wrapper";

export default async function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col p-6 bg-slate-100/60">
      <TopNavWrapper />
      <main className="mx-auto w-full max-w-[76rem] px-4 pt-4 pb-7 bg-white rounded">
        {children}
      </main>
      <Footer />
    </div>
  );
}