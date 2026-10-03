/**
 * Editable fields per CMS section type. Shared by the admin editor (to render
 * inputs) and the save action (to whitelist and validate what is stored).
 *
 * - `shared`: language-independent values stored in page_sections.settings
 * - `local`: per-language values; title/subtitle/content are columns of
 *   page_section_translations, everything else goes into its `data` JSON
 */
export type SharedField =
  | { key: string; kind: "href" }
  | { key: string; kind: "select"; options: string[] }
  | { key: string; kind: "bool" }
  | { key: string; kind: "number"; min: number; max: number }
  | { key: string; kind: "text"; max: number }
  | { key: string; kind: "mapUrl" }
  | { key: string; kind: "mediaList" }
  | { key: string; kind: "amenityList" };

export type LocalField =
  | { key: "title" | "subtitle"; kind: "text" | "textarea"; max: number }
  | { key: "content"; kind: "rich" }
  | { key: string; kind: "text" | "textarea"; max: number; data: true }
  | { key: "items"; kind: "cards" | "faq"; data: true };

export type SectionConfig = { media?: boolean; shared: SharedField[]; local: LocalField[] };

const title = { key: "title", kind: "text", max: 200 } as const;
const subtitle = { key: "subtitle", kind: "textarea", max: 600 } as const;
const content = { key: "content", kind: "rich" } as const;
const d = (key: string, max = 120, kind: "text" | "textarea" = "text") => ({ key, kind, max, data: true as const });

export const SECTION_CONFIG: Record<string, SectionConfig> = {
  hero: {
    media: true,
    shared: [{ key: "primary_href", kind: "href" }, { key: "secondary_href", kind: "href" }],
    local: [d("eyebrow"), title, subtitle, d("primary_label", 60), d("secondary_label", 60)],
  },
  availability_search: { shared: [], local: [title, subtitle] },
  text: { shared: [], local: [title, subtitle, content] },
  image_text: { media: true, shared: [{ key: "image_position", kind: "select", options: ["left", "right"] }], local: [title, subtitle, content] },
  features: { shared: [], local: [title, subtitle, { key: "items", kind: "cards", data: true }] },
  steps: { shared: [{ key: "layout", kind: "select", options: ["horizontal", "vertical"] }], local: [title, subtitle, { key: "items", kind: "cards", data: true }] },
  cta: {
    media: true,
    shared: [{ key: "variant", kind: "select", options: ["primary", "contact", "muted"] }, { key: "button_href", kind: "href" }, { key: "show_address", kind: "bool" }],
    local: [title, subtitle, d("button_label", 60)],
  },
  faq: { shared: [], local: [title, subtitle, { key: "items", kind: "faq", data: true }] },
  gallery: { shared: [{ key: "media_ids", kind: "mediaList" }], local: [title, subtitle] },
  amenities: { shared: [{ key: "amenity_ids", kind: "amenityList" }, { key: "limit", kind: "number", min: 1, max: 50 }], local: [title, subtitle, d("cta_label", 60)] },
  rooms: { shared: [{ key: "limit", kind: "number", min: 1, max: 12 }], local: [title, subtitle, d("cta_label", 60)] },
  workspaces: { shared: [{ key: "limit", kind: "number", min: 1, max: 12 }], local: [title, subtitle, d("cta_label", 60)] },
  page_header: { media: true, shared: [{ key: "cta_href", kind: "href" }], local: [title, subtitle, d("cta_label", 60)] },
  workspace_list: { shared: [], local: [title, subtitle] },
  room_list: { shared: [], local: [title, subtitle] },
  amenity_list: { shared: [], local: [title, subtitle] },
  contact_info: { shared: [], local: [title, subtitle, d("address_label", 60), d("phone_label", 60), d("email_label", 60), d("hours_label", 60)] },
  contact_form: { shared: [], local: [title, subtitle, d("success_message", 400, "textarea")] },
  map: { shared: [{ key: "embed_url", kind: "mapUrl" }], local: [title] },
  imprint: {
    shared: [
      { key: "legal_name", kind: "text", max: 200 },
      { key: "representative", kind: "text", max: 200 },
      { key: "address", kind: "text", max: 300 },
      { key: "phone", kind: "text", max: 60 },
      { key: "email", kind: "text", max: 200 },
      { key: "register_court", kind: "text", max: 200 },
      { key: "register_number", kind: "text", max: 100 },
      { key: "vat_id", kind: "text", max: 60 },
      { key: "responsible_person", kind: "text", max: 300 },
    ],
    local: [title, content],
  },
  custom: { media: true, shared: [], local: [title, subtitle, content] },
};

export const SECTION_TYPES = Object.keys(SECTION_CONFIG);

const MAP_HOSTS = ["www.google.com", "maps.google.com", "www.openstreetmap.org"];
export function isAllowedMapUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && MAP_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** Map of shared-field keys to their translation label key under admin.pages.fields. */
export const FIELD_LABELS: Record<string, string> = {
  primary_href: "primaryHref",
  secondary_href: "secondaryHref",
  primary_label: "primaryLabel",
  secondary_label: "secondaryLabel",
  eyebrow: "eyebrow",
  image_position: "imagePosition",
  layout: "layout",
  variant: "variant",
  button_href: "buttonHref",
  button_label: "buttonLabel",
  show_address: "showAddress",
  media_ids: "galleryImages",
  amenity_ids: "selectedAmenities",
  limit: "limit",
  cta_href: "ctaHref",
  cta_label: "ctaLabel",
  address_label: "addressLabel",
  phone_label: "phoneLabel",
  email_label: "emailLabel",
  hours_label: "hoursLabel",
  success_message: "successMessage",
  embed_url: "embedUrl",
  legal_name: "legalName",
  representative: "representative",
  address: "address",
  phone: "phone",
  email: "email",
  register_court: "registerCourt",
  register_number: "registerNumber",
  vat_id: "vatId",
  responsible_person: "responsiblePerson",
  title: "title",
  subtitle: "subtitle",
  content: "content",
  items: "items",
};
