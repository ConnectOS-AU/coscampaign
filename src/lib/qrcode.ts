import QRCode from "qrcode";

export async function generateQrCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text);
}
