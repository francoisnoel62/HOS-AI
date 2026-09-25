// Copy for "HOS, HTNG and OpenTravel". Every statement about another specification comes from a source listed in
// comparisonSources, as read on 25 September 2026.

export const standardsCompared = [
  {
    name: "OpenTravel",
    question: "Can I sell and book this room?",
    since: "Since 1999 · OpenTravel Alliance",
    builtFor: "Shopping, availability, rates and reservations between travel systems: GDS, CRS, channel managers, booking engines and the PMS.",
    shape: "The OTA XML message suite, published since 2001. Since 2018, a 2.0 object model that also produces JSON Schema and REST contracts.",
  },
  {
    name: "HTNG",
    question: "How does this system plug into the PMS?",
    since: "Since 2002 · now part of AHLA",
    builtFor: "Interfaces between hotel systems: check-in notices to locks, phones and TVs, folio postings, payments, event subscriptions, and HTNG Express for light PMS integrations.",
    shape: "Web-service interfaces built on OpenTravel's message conventions, WS-Eventing subscriptions, and JSON APIs for HTNG Express.",
  },
  {
    name: "HOS",
    question: "What is true about this stay and this room, and who says so?",
    since: "Since 2026 · 0.1 draft",
    builtFor: "Operational facts that every system on a property shares, for the staff and the AI agents who act on them.",
    shape: "CloudEvents facts with provenance, producer manifests that declare authority, replay rules, and a public conformance corpus.",
  },
] as const;

export const htngExpressQuotes = [
  "Vendors need to learn basic information about who is in the room, understand the state of the room, and potentially post charges.",
  "The result is that timelines are extensive for very basic needs, and innovation is stifled for the industry.",
] as const;

// One room of the example rooms response in HTNG's htng-express repository, verbatim.
export const htngExpressRoom = {
  room_number: "1000",
  room_type_code: "KNSM",
  maid_id: "0",
  status_service_requested: "MAKE_UP_ROOM",
  is_inventoried: true,
  status_front_office_occupancy: "OCCUPIED",
  status_housekeeping_occupancy: "OCCUPIED",
  status_housekeeping_cleaning: "INSPECTED",
  status_inventory: "NONE",
};

export type ContractAnswer = { title: string; text: string; proof: { label: string; href: string } };

export const contractAnswers: ContractAnswer[] = [
  {
    title: "Who is right",
    text: "Each producer's manifest declares what it is the authority for, per property, event type and unit status dimension. One authority at most. Every other value is kept and shown as a conflict, never merged away.",
    proof: { label: "Early arrival · delivery 9", href: "/demo" },
  },
  {
    title: "What to ignore",
    text: "Undeclared means denied. A producer can only publish what its manifest declares for that property, so a system cannot quietly start deciding what it was never trusted with.",
    proof: { label: "Early arrival · delivery 7", href: "/demo" },
  },
  {
    title: "When it happened",
    text: "Every fact says when it occurred and when it was recorded, whether that time is exact or only a last modification, and which property time zone and business date it belongs to.",
    proof: { label: "Late check-out · deliveries 10–11", href: "/demo/late-checkout" },
  },
  {
    title: "Twice, late or missed",
    text: "Delivery is at least once. Duplicates are dropped on source and id, the latest occurrence wins whatever the delivery order, and each producer declares how far back it can replay and whether it sends snapshots after an outage.",
    proof: { label: "Room out of order · delivery 10", href: "/demo/room-out-of-order" },
  },
  {
    title: "What stays out",
    text: "Data objects are closed. Guests are pseudonymous ids. Names, contact details, payment data and message content never enter HOS; a message becomes a signal, such as an expected arrival time.",
    proof: { label: "Early arrival · delivery 10", href: "/demo" },
  },
  {
    title: "Whether an implementation is right",
    text: "Three public scenarios, 42 deliveries, and the exact dispositions, readiness and situations an implementation must reproduce. Anyone can replay them through their own implementation today.",
    proof: { label: "The conformance corpus", href: "/docs/events#conformance" },
  },
];

export const layers = [
  { verb: "Sell and book", standard: "OpenTravel", text: "Channels, GDS, CRS and booking engines exchange availability, rates and reservations with the PMS." },
  { verb: "Plug in", standard: "HTNG", text: "The PMS feeds locks, phones, TVs, POS, payments and guest apps through agreed interfaces." },
  { verb: "Observe and trust", standard: "HOS", text: "Every system publishes what happened, with its source and authority. Staff and agents read one traceable picture." },
] as const;

export const comparisonSources = [
  { label: "OpenTravel Alliance", href: "https://opentravel.org/", note: "Founded in 1999; the OTA XML message suite, published since 2001." },
  { label: "About the OpenTravel 2.0 Object Model", href: "https://opentravel.org/about-2-0-object-model/", note: "XML, JSON Schema and Swagger contracts; the 2018A hospitality publication." },
  { label: "OTA_HotelResNotifRQ schema, OTA 2010A", href: "https://github.com/ExM/XsdCoverage/blob/master/Ota/XsdShemas/OTA_HotelResNotifRQ.xsd", note: "Reservation notification: guests, profiles, room stays and guarantee." },
  { label: "AHLA to integrate HTNG", href: "https://www.ahla.com/news/ahla-integrate-htng-strengthening-technology-expertise-advocacy-focus", note: "HTNG becomes part of the American Hotel & Lodging Association." },
  { label: "HTNG workgroups", href: "https://www.ahla.com/htng/workgroups", note: "Current workgroups and membership." },
  { label: "HTNG web-services interface specifications", href: "https://hospitalitytech.com/htng-beefs-web-services-based-interface-specifications", note: "Event notification with WS-Eventing: check-ins, folio postings, room assignment changes." },
  { label: "HTNG_HotelCheckInNotifRQ", href: "https://confluence.protel.net/pages/viewpage.action?pageId=117826535", note: "A PMS notifies guest-room systems of check-ins and check-outs." },
  { label: "HTNG Express, official repository", href: "https://github.com/HTNG/htng-express", note: "README and example messages, revision 2d17a11 (September 2022)." },
] as const;
