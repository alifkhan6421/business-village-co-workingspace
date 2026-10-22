/**
 * Default photos (Unsplash licence) shown until an admin uploads real photos in
 * Admin → Media. Unsplash resizes on its CDN, so these are rendered with
 * `unoptimized` and a width parameter instead of going through next/image.
 */
const BASE = "https://images.unsplash.com/photo-";

const HERO = "1497366216548-37526070297c";
const WORKSPACE = ["1524758631624-e2822e304c36", "1497366811353-6870744d04b2", "1497215728101-856f4ea42174", "1519389950473-47ba0277781c"];
const ROOM = ["1431540015161-0bf868a2d407", "1517502884422-41eaead166d4", "1556761175-b413da4baf72"];

export type StockPhoto = { url: string; alt: string; stock: true };

/**
 * Real photos of the Business Village rooms, shipped with the site in public/images/rooms
 * (already resized). Served as-is like the stock photos, without the image optimizer.
 */
const ROOM_PHOTOS: Record<string, string> = {
  "blue-room": "/images/rooms/blue-room.jpg",
  "green-room": "/images/rooms/green-room.jpg",
  cube: "/images/rooms/cube.jpg",
  "red-mini": "/images/rooms/red-mini.jpg",
  "red-maxi": "/images/rooms/red-maxi.jpg",
};

function url(id: string, width: number) {
  return `${BASE}${id}?auto=format&fit=crop&w=${width}&q=70`;
}

function pick(list: string[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function stockHero(width = 1920): StockPhoto {
  return { url: url(HERO, width), alt: "", stock: true };
}

/**
 * The built-in photo of a real room (by slug), otherwise a stable stock photo per
 * resource, so a desk keeps the same picture across pages.
 */
export function stockResource(type: "workspace" | "room", seed: string, width = 1200): StockPhoto {
  if (type === "room" && ROOM_PHOTOS[seed]) return { url: ROOM_PHOTOS[seed], alt: "", stock: true };
  return { url: url(pick(type === "workspace" ? WORKSPACE : ROOM, seed), width), alt: "", stock: true };
}

export function isStock(src: string) {
  return src.startsWith(BASE);
}
