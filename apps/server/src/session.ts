import crypto from "node:crypto";

export type SessionPayload = {
  userId: string;
  roomId: string;
  displayName: string;
  issuedAt: number;
};

const toBase64Url = (input: Buffer): string =>
  input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const fromBase64Url = (input: string): Buffer => {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
};

export const createSessionToken = (payload: SessionPayload, secret: string): string => {
  const payloadJson = JSON.stringify(payload);
  const payloadPart = toBase64Url(Buffer.from(payloadJson, "utf8"));
  const sig = crypto.createHmac("sha256", secret).update(payloadPart).digest();
  const sigPart = toBase64Url(sig);
  return `${payloadPart}.${sigPart}`;
};

export const verifySessionToken = (token: string, secret: string): SessionPayload | null => {
  const [payloadPart, sigPart] = token.split(".");
  if (!payloadPart || !sigPart) return null;

  const expectedSig = crypto.createHmac("sha256", secret).update(payloadPart).digest();
  let providedSig: Buffer;
  try {
    providedSig = fromBase64Url(sigPart);
  } catch {
    return null;
  }

  // Timing-safe compare on raw bytes.
  if (providedSig.length !== expectedSig.length || !crypto.timingSafeEqual(providedSig, expectedSig)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadPart).toString("utf8")) as SessionPayload;
    if (!payload.userId || !payload.roomId || !payload.displayName || !payload.issuedAt) return null;
    return payload;
  } catch {
    return null;
  }
};
