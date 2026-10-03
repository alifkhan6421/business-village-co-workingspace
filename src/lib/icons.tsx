import {
  Accessibility, AirVent, ArrowUpDown, Armchair, Bike, Building2, CalendarCheck, CalendarDays, Car, Check, Coffee,
  CookingPot, Printer, Lock, LayoutGrid, Lightbulb, MailCheck, MapPin, Mic, Monitor, MonitorSmartphone,
  MousePointerClick, Plug, Presentation, Projector, Settings2, ShieldCheck, Sofa, Sparkles, Sun, Tv,
  Users, Video, Wifi, Headphones, Leaf, Clock, Phone, Mail, Star, Handshake, Zap, Podcast, Accessibility as A11y,
  type LucideIcon,
} from "lucide-react";

/** Icons admins can choose for amenities and content cards (stored by name). */
export const ICONS: Record<string, LucideIcon> = {
  check: Check, wifi: Wifi, monitor: Monitor, "monitor-smartphone": MonitorSmartphone, plug: Plug,
  "arrow-up-down": ArrowUpDown, presentation: Presentation, tv: Tv, projector: Projector, video: Video,
  "air-vent": AirVent, accessibility: Accessibility, coffee: Coffee, "cooking-pot": CookingPot, printer: Printer,
  lock: Lock, armchair: Armchair, sofa: Sofa, bike: Bike, car: Car, "building-2": Building2, mic: Mic,
  headphones: Headphones, podcast: Podcast, sun: Sun, leaf: Leaf, lightbulb: Lightbulb, sparkles: Sparkles,
  "calendar-check": CalendarCheck, "calendar-days": CalendarDays, "layout-grid": LayoutGrid,
  "mail-check": MailCheck, "map-pin": MapPin, "mouse-pointer-click": MousePointerClick, "settings-2": Settings2,
  "shield-check": ShieldCheck, users: Users, clock: Clock, phone: Phone, mail: Mail, star: Star,
  handshake: Handshake, zap: Zap, wheelchair: A11y,
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Cmp = (name && ICONS[name]) || Check;
  return <Cmp className={className} aria-hidden="true" />;
}
