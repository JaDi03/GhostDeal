// Ready's WalletRPCError often has an empty .message; the code is on toString() or .cause.

export const PRIVATE_TOKENS_OFF =
  "Private tokens are off. In Ready: Account settings, then enable private tokens.";

export function privateErrorText(err: unknown): string {
  const chunks: string[] = [];
  if (err instanceof Error) {
    if (err.name) chunks.push(err.name);
    if (err.message) chunks.push(err.message);
    if (err.cause instanceof Error && err.cause.message) chunks.push(err.cause.message);
    else if (typeof err.cause === "string") chunks.push(err.cause);
  } else if (err && typeof err === "object" && "message" in err) {
    const nested = (err as { message: unknown }).message;
    if (typeof nested === "string") chunks.push(nested);
  }
  try {
    const asString = String(err);
    if (asString && asString !== "[object Object]") chunks.push(asString);
  } catch {
    /* ignore */
  }
  return chunks.join(" ");
}

export function isPrivateTokensOffError(err: unknown): boolean {
  return /NOT_REGISTERED|not registered|viewing key/i.test(privateErrorText(err));
}

export function friendlyPrivateError(err: unknown, fallback: string): string {
  if (isPrivateTokensOffError(err)) return PRIVATE_TOKENS_OFF;
  return privateErrorText(err) || fallback;
}
