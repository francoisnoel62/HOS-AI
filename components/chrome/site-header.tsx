import Link from "next/link";

import { Wordmark } from "@/components/brand/hos-mark";
import { MobileMenu } from "@/components/chrome/mobile-menu";
import { ThemeToggle } from "@/components/chrome/theme-toggle";
import { Button } from "@/components/ui/button";
import { navigation } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/93 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
        <Link aria-label="HOS AI home" href="/">
          <Wordmark />
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-5 lg:flex">
          {navigation.map((item) => (
            <Link className="text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <Link className="text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]" href="/docs">
            Documentation
          </Link>
          <ThemeToggle />
          <Link href="/participate">
            <Button size="sm">Participate</Button>
          </Link>
        </nav>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
