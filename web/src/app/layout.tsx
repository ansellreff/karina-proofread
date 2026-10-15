import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Literata } from "next/font/google";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavLinks } from "@/components/nav-links";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Karina Proofread",
  description: "Proofreading workspace for student enrollment documents",
};

export const viewport: Viewport = { themeColor: "#2b3990", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${literata.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <header className="no-print sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
            <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:gap-6 sm:px-6">
              <Link href="/" className="font-serif text-[1.05rem] font-semibold tracking-tight whitespace-nowrap text-foreground sm:text-[1.15rem]">
                Karina <span className="hidden text-primary sm:inline">Proofread</span>
              </Link>
              <NavLinks />
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
          <Toaster position="bottom-center" />
        </TooltipProvider>
      </body>
    </html>
  );
}
