import type { Metadata } from "next";
import "./globals.css";
import { openSans, fontgeist } from "../components/fonts";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/light-dark-theme/theme-provider";

export const metadata: Metadata = {
  title: "Animal Shelter & Operations Platform",
  description: "Find your new best friend.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontgeist.className} ${openSans.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}