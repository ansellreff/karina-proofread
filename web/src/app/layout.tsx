import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Literata } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Karina Proofread", template: "%s | Karina Proofread" },
  description: "Proofreading workspace for student enrollment documents",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2b3990" },
    { media: "(prefers-color-scheme: dark)", color: "#11141b" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${literata.variable} h-full`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider delay={350}>
            <header className="no-print sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
              <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:gap-6 sm:px-6">
                <Link href="/" aria-label="Karina Proofread: documents" className="flex items-center gap-2 font-serif text-[1.05rem] font-semibold tracking-tight whitespace-nowrap text-foreground sm:text-[1.15rem]">
                  <span aria-hidden className="flex size-7 items-center justify-center rounded-md bg-primary font-serif text-sm text-primary-foreground">K</span>
                  <span className="hidden sm:inline">
                    Karina <span className="text-primary">Proofread</span>
                  </span>
                </Link>
                <NavLinks />
                <div className="ml-auto">
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <div className="flex flex-1 flex-col">{children}</div>
            <Toaster position="bottom-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
