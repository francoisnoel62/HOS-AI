import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <section className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-5 py-20 lg:px-8"><p className="eyebrow">404</p><h1 className="mt-3 text-5xl font-semibold tracking-[-0.065em]">This route does not exist.</h1><p className="mt-5 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">The HOS AI site only links to public material that is actually available.</p><Link className="mt-8 inline-block" href="/"><Button>Return home</Button></Link></section>;
}
