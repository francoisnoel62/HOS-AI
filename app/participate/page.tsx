import type { Metadata } from "next";

import { PageHero } from "@/components/content/page-hero";
import { ParticipationCard } from "@/components/participation/participation-card";
import { participationPaths } from "@/lib/content/site-copy";

export const metadata: Metadata = { title: "Participate", description: "Choose a qualified HOS AI participation path: founding member, pilot, technical contributor or financial patron." };

export default function ParticipatePage() {
  return <><PageHero eyebrow="Participate" title="Bring the expertise, terrain or support that makes HOS useful." description="Every path begins with a concise professional conversation. No payment, scheduling, confidential data request or exclusive privilege is created by this form." /><section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 md:grid-cols-2 lg:px-8">{participationPaths.map((path, index) => <ParticipationCard {...path} featured={index === 0} key={path.slug} />)}</section></>;
}
