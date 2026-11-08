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
