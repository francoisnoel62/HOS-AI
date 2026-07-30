export async function verifyTurnstile(token: string | null, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.LOCAL_FORMS_MODE === "true") return true;
    throw new Error("Turnstile is not configured.");
  }
  if (!token) throw new Error("Verification is required.");
  const body = new URLSearchParams({ secret, response: token });
  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (remoteIp) body.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const data = (await response.json()) as { success?: boolean };
  if (!data.success) throw new Error("Verification was not accepted.");
  return true;
}
