/**
 * Brand defaults. The live values come from Admin → Settings (brand_name, brand_tagline,
 * brand_parent), so the marketplace can be renamed later without touching code.
 */
export const BRAND_DEFAULTS = {
  name: 'B-MART',
  tagline: 'Your Digital Shopping Destination',
  parent: 'Noorix Digital Lab',
  slogan: 'Your Digital World, One Marketplace.',
  promo: 'Instant delivery on automatic products · Easypaisa, JazzCash & bank transfer · WhatsApp support',
};
export interface Brand { name: string; tagline: string; parent: string; slogan: string }
export const brandFrom = (s: Record<string, string>): Brand => ({
  name: s.brand_name?.trim() || BRAND_DEFAULTS.name,
  tagline: s.brand_tagline?.trim() || BRAND_DEFAULTS.tagline,
  parent: s.brand_parent?.trim() || BRAND_DEFAULTS.parent,
  slogan: s.brand_slogan?.trim() || BRAND_DEFAULTS.slogan,
});
/** Splits "B-MART" into ["B-", "MART"] so the first part can take the accent gradient. */
export const splitName = (name: string): [string, string] => { const i = name.indexOf('-'); return i > 0 ? [name.slice(0, i + 1), name.slice(i + 1)] : ['', name]; };

/** Business contact details shown in the footer, Support page and policies. Admin → Settings values win when set. */
export const CONTACT_DEFAULTS = {
  whatsapp: '923154429417',
  email: 'noorixdigitals@gmail.com',
  address: '3rd Floor, H-Mall, Shalimar Link Road, Lahore, Pakistan',
};
export interface Contact { whatsapp: string; email: string; address: string; phone: string }
/** 923154429417 → "+92 315 4429417" */
export const fmtPhone = (digits: string) => { const d = digits.replace(/\D/g, ''); return d.startsWith('92') && d.length === 12 ? `+92 ${d.slice(2, 5)} ${d.slice(5)}` : `+${d}`; };
export const contactFrom = (s: Record<string, string>): Contact => {
  const whatsapp = (s.whatsapp || '').replace(/\D/g, '') || CONTACT_DEFAULTS.whatsapp;
  return { whatsapp, phone: fmtPhone(whatsapp), email: s.support_email?.trim() || CONTACT_DEFAULTS.email, address: s.contact_address?.trim() || CONTACT_DEFAULTS.address };
};
