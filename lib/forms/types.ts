export const formRouteKinds = ["founding-member", "pilot", "technical-contributor", "financial-patron", "contact"] as const;

export type FormRouteKind = (typeof formRouteKinds)[number];
export type SubmissionKind = "founding_member" | "pilot" | "technical_contributor" | "financial_patron" | "general_inquiry";

export const submissionKindByRoute: Record<FormRouteKind, SubmissionKind> = {
  "founding-member": "founding_member",
  pilot: "pilot",
  "technical-contributor": "technical_contributor",
  "financial-patron": "financial_patron",
  contact: "general_inquiry",
};

export function isFormRouteKind(value: string): value is FormRouteKind {
  return (formRouteKinds as readonly string[]).includes(value);
}
