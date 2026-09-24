"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";

import { Wordmark } from "@/components/brand/hos-mark";
import { Button } from "@/components/ui/button";
import { navigation } from "@/lib/site";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <Button aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} size="sm" variant="ghost">
        {open ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
      </Button>
      {open ? createPortal(
        <div className="fixed inset-0 z-50 bg-[var(--background)] px-6 py-6" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Wordmark />
            <Button aria-label="Close menu" onClick={() => setOpen(false)} size="sm" variant="ghost">
              <X aria-hidden="true" size={18} />
            </Button>
          </div>
          <nav aria-label="Mobile navigation" className="mx-auto mt-20 flex max-w-6xl flex-col gap-2">
            <Link className="border-b border-[var(--border)] py-5 text-2xl font-medium" href="/" onClick={closeMenu}>
              Home
            </Link>
            {navigation.map((item) => (
              <Link className="border-b border-[var(--border)] py-5 text-2xl font-medium" href={item.href} key={item.href} onClick={closeMenu}>
                {item.label}
              </Link>
            ))}
            <Link className="border-b border-[var(--border)] py-5 text-2xl font-medium" href="/docs" onClick={closeMenu}>
              Documentation
            </Link>
            <Link className="mt-8" href="/participate" onClick={closeMenu}>
              <Button className="w-full" size="lg">Participate</Button>
            </Link>
          </nav>
        </div>,
        // Portal to body: the header's backdrop-filter would otherwise clip this fixed overlay to the header box.
        document.body,
      ) : null}
    </div>
  );
}
