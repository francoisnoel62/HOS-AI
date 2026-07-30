"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Route error", { message: error.message, digest: error.digest }); }, [error]);
  return <section className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-5 py-20 lg:px-8"><p className="eyebrow">Unexpected state</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em]">This page could not be loaded.</h1><p className="mt-4 max-w-xl leading-7 text-[var(--muted-foreground)]">No information has been lost. You can try again or return to the HOS AI homepage.</p><div className="mt-8 flex gap-3"><Button onClick={reset}>Try again</Button><Link href="/"><Button variant="secondary">Return home</Button></Link></div></section>;
}
