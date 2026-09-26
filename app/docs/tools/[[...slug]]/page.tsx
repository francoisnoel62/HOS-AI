import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OnThisPage, PageFooter, PageHeader } from "@/components/docs/page-chrome";
import { pageHeadings } from "@/lib/docs/content";
import { allToolsPages, findToolsPage } from "@/lib/docs/tools";

import { pageContent } from "./content";

type Params = Promise<{ slug?: string[] }>;

const hrefOf = (slug: string[] = []) => ["/docs/tools", ...slug].join("/");

// Every page is listed in lib/docs/tools.ts and built ahead; any other address under /docs/tools is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return allToolsPages.map((item) => ({ slug: item.href.split("/").slice(3) }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const item = findToolsPage(hrefOf((await params).slug));
  if (!item) return {};
  return {
    title: item.href === "/docs/tools" ? item.title : `${item.title} · HOS tools`,
    description: item.description,
    alternates: { canonical: item.href },
    // Until it is written, a page only announces its content: search engines leave it out.
    ...(item.written ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ToolsDocumentationPage({ params }: { params: Params }) {
  const item = findToolsPage(hrefOf((await params).slug));
  if (!item) notFound();
  const { default: Content } = await pageContent[item.file]();
  const headings = pageHeadings(item);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:gap-10">
      <article className="min-w-0 max-w-3xl py-10 sm:py-14">
        <PageHeader page={item} />
        <OnThisPage headings={headings} placement="top" />
        <div className="docs-prose mt-10">
          <Content />
        </div>
        <PageFooter page={item} />
      </article>
      <OnThisPage headings={headings} placement="aside" />
    </div>
  );
}
