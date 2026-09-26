import type { Metadata } from "next";

import { PageHero } from "@/components/content/page-hero";
import { ParticipationCard } from "@/components/participation/participation-card";
import { participationPaths } from "@/lib/content/site-copy";

export const metadata: Metadata = { title: "Participate", description: "Four ways to take part in HOS AI: run a pilot, become a founding member, contribute technically or become a financial patron." };

export default function ParticipatePage() {
  return <><PageHero eyebrow="Participate" title="Four ways to build HOS with us." description="Each path starts with a short conversation. Sending a form commits you to nothing: no payment, no confidential data, and no exclusive rights for anyone." /><section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 md:grid-cols-2 lg:px-8">{participationPaths.map((path, index) => <ParticipationCard {...path} featured={index === 0} key={path.slug} />)}</section></>;
}
