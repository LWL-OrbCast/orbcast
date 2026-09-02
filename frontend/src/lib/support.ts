/** WhatsApp Click to Chat: E.164 without + (e.g. UK +44 7474 770034 → 447474770034) */
export const WHATSAPP_SUPPORT_PHONE_E164_NO_PLUS = '447474770034';

export function buildWhatsAppSupportUrl(message: string): string {
  const text = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${WHATSAPP_SUPPORT_PHONE_E164_NO_PLUS}&text=${text}`;
}
