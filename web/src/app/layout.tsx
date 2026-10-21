import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Literata } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CURRENT_VERSION } from "@/lib/update-log";
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
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-logo p-0.5">
                    <Image src="/icons/logo.png" alt="" width={32} height={32} priority unoptimized className="size-full object-contain" />
                  </span>
                  <span className="hidden sm:inline">
                    Karina <span className="text-primary">Proofread</span>
                  </span>
                </Link>
                <Link
                  href="/updates"
                  title="Update log"
                  aria-label={`Version ${CURRENT_VERSION}: see what changed`}
                  data-version-badge
                  className="-ml-1 hidden rounded-full border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums hover:border-primary hover:text-primary md:inline-block"
                >
                  V.{CURRENT_VERSION}
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
