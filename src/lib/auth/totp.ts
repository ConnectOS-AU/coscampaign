import { OTP } from "otplib";
import QRCode from "qrcode";

const otp = new OTP({ strategy: "totp" });

// Tolerate one time-step of drift in either direction (±30s), matching the
// leeway most authenticator apps and other TOTP implementations use.
const EPOCH_TOLERANCE: [number, number] = [30, 30];

export function generateTotpSecret(): string {
  return otp.generateSecret();
}

export function generateTotpUri(email: string, secret: string): string {
  return otp.generateURI({ issuer: "COSCampaign", label: email, secret });
}

export async function generateQrCodeDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  const result = await otp.verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE });
  return result.valid;
}
