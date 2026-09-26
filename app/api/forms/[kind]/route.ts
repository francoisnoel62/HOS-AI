import { NextResponse } from "next/server";

import { writeLocalOutboxMessage } from "@/lib/forms/outbox";
import { createSubmission } from "@/lib/forms/repository";
import { formDataToObject, formSchemas, schemaKeyForRoute } from "@/lib/forms/schema";
import { assertHoneypot, assertSafeRequest, enforceRateLimit } from "@/lib/forms/security";
import { verifyTurnstile } from "@/lib/forms/turnstile";
import { isFormRouteKind, submissionKindByRoute } from "@/lib/forms/types";

function redirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind: rawKind } = await context.params;
  if (!isFormRouteKind(rawKind)) return redirect(request, "/contact?error=unknown-form");
  try {
    assertSafeRequest(request);
    const formData = await request.formData();
    const schemaKey = schemaKeyForRoute(rawKind);
    const values = formDataToObject(schemaKey, formData);
    assertHoneypot(values.websiteTrap);
    await enforceRateLimit(request);
    await verifyTurnstile(typeof formData.get("turnstileToken") === "string" ? String(formData.get("turnstileToken")) : null, request);
    const parsed = formSchemas[schemaKey].safeParse(values);
    if (!parsed.success) return redirect(request, `/${rawKind === "contact" ? "contact" : `participate/${rawKind}`}?error=invalid`);

    const submission = await createSubmission({
      kind: submissionKindByRoute[rawKind],
      payload: parsed.data,
      email: parsed.data.email,
      country: parsed.data.country,
    });
    const internalRecipient = process.env.HOS_INBOX_EMAIL ?? "local-hos-inbox@localhost";
    try {
      await Promise.all([
        writeLocalOutboxMessage({
          type: "internal-notification",
          recipient: internalRecipient,
          submissionId: submission.id,
          kind: submissionKindByRoute[rawKind],
        }),
        writeLocalOutboxMessage({
          type: "acknowledgement",
          recipient: parsed.data.email,
          submissionId: submission.id,
          kind: submissionKindByRoute[rawKind],
        }),
      ]);
    } catch (deliveryError) {
      console.error("Local outbox delivery failed", {
        submissionId: submission.id,
        error: deliveryError instanceof Error ? deliveryError.message : "unknown",
      });
    }
    return redirect(request, `/thanks/${rawKind}`);
  } catch (error) {
    console.error("Form submission rejected", { kind: rawKind, error: error instanceof Error ? error.message : "unknown" });
    return redirect(request, `/${rawKind === "contact" ? "contact" : `participate/${rawKind}`}?error=unavailable`);
  }
}
