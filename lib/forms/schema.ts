import { z } from "zod";

import type { FormRouteKind } from "@/lib/forms/types";

const conciseText = (label: string, minimum = 2, maximum = 1_000) =>
  z.string().trim().min(minimum, `${label} is required.`).max(maximum, `${label} is too long.`);
const optionalText = (maximum = 300) => z.string().trim().max(maximum, "This field is too long.").optional().or(z.literal(""));

const commonSchema = z.object({
  contactName: conciseText("Name", 2, 120),
  email: z.string().trim().email("Enter a valid professional email address.").max(320),
  organization: optionalText(180),
  country: conciseText("Country", 2, 100),
  context: conciseText("Context", 12, 1_000),
  privacyAccepted: z.literal("on", { errorMap: () => ({ message: "Please acknowledge the privacy notice." }) }),
  websiteTrap: z.string().max(0, "Unable to submit this form."),
});

export const formSchemas = {
  founding_member: commonSchema.extend({
    organization: conciseText("Organisation", 2, 180),
    role: conciseText("Role", 2, 120),
    actorType: conciseText("Organisation type", 2, 100),
    interestArea: conciseText("Primary interest", 2, 180),
    systemCategories: z.array(conciseText("System category", 2, 60)).min(1, "Choose at least one system category."),
    engagementLevel: conciseText("Engagement level", 2, 180),
    futureRepresentatives: z.enum(["yes", "not_yet"]),
    website: optionalText(500),
  }),
  pilot: commonSchema.extend({
    organization: conciseText("Organisation", 2, 180),
    propertyCount: conciseText("Approximate property count", 1, 60),
    pms: conciseText("PMS", 2, 120),
    housekeepingTool: optionalText(120),
    messagingTool: optionalText(120),
    arrivalScenario: conciseText("Arrival scenario", 12, 600),
    businessRole: conciseText("Business contact role", 2, 120),
    technicalRole: conciseText("Technical contact role", 2, 120),
    apiAccess: z.enum(["yes", "not_yet"]),
  }),
  technical_contributor: commonSchema.extend({
    githubHandle: optionalText(80),
    contributionDomain: conciseText("Contribution domain", 2, 100),
  }),
  financial_patron: commonSchema.extend({
    supporterCategory: z.enum(["individual", "company", "institution"]),
  }),
  general_inquiry: commonSchema.extend({
    organization: optionalText(180),
  }),
} as const;

export type FormSchemaKey = keyof typeof formSchemas;
export type ParsedSubmission = z.infer<(typeof formSchemas)[FormSchemaKey]>;

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function formDataToObject(kind: FormSchemaKey, formData: FormData) {
  const base = {
    contactName: readString(formData, "contactName"),
    email: readString(formData, "email"),
    organization: readString(formData, "organization"),
    country: readString(formData, "country"),
    context: readString(formData, "context"),
    privacyAccepted: readString(formData, "privacyAccepted"),
    websiteTrap: readString(formData, "websiteTrap"),
  };

  switch (kind) {
    case "founding_member":
      return { ...base, role: readString(formData, "role"), actorType: readString(formData, "actorType"), interestArea: readString(formData, "interestArea"), systemCategories: formData.getAll("systemCategories").filter((value): value is string => typeof value === "string"), engagementLevel: readString(formData, "engagementLevel"), futureRepresentatives: readString(formData, "futureRepresentatives"), website: readString(formData, "website") };
    case "pilot":
      return { ...base, propertyCount: readString(formData, "propertyCount"), pms: readString(formData, "pms"), housekeepingTool: readString(formData, "housekeepingTool"), messagingTool: readString(formData, "messagingTool"), arrivalScenario: readString(formData, "arrivalScenario"), businessRole: readString(formData, "businessRole"), technicalRole: readString(formData, "technicalRole"), apiAccess: readString(formData, "apiAccess") };
    case "technical_contributor":
      return { ...base, githubHandle: readString(formData, "githubHandle"), contributionDomain: readString(formData, "contributionDomain") };
    case "financial_patron":
      return { ...base, supporterCategory: readString(formData, "supporterCategory") };
    case "general_inquiry":
      return base;
  }
}

export function schemaKeyForRoute(kind: FormRouteKind): FormSchemaKey {
  return kind === "founding-member" ? "founding_member" : kind === "technical-contributor" ? "technical_contributor" : kind === "financial-patron" ? "financial_patron" : kind === "contact" ? "general_inquiry" : "pilot";
}

export function retentionDueAt(lastExchangeAt: Date) {
  const due = new Date(lastExchangeAt);
  due.setUTCFullYear(due.getUTCFullYear() + 1);
  return due;
}
