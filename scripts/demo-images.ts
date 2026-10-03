// Generates simple illustrated placeholder images for the demo data so the
// site looks complete before real photos are uploaded through Admin → Media.
import sharp from "sharp";

const palettes = [
  ["#2f6b57", "#a8c9b8", "#f4efe3", "#c9a24a"],
  ["#35596e", "#a9c4d4", "#f2efe8", "#d08c5b"],
  ["#5b4a6e", "#c6b8d6", "#f3f0ea", "#d6a84a"],
  ["#4a6b3a", "#bed3a9", "#f5f1e6", "#b86b4b"],
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

export function workspaceSvg(label: string, seed: number) {
  const [dark, light, wall, accent] = palettes[seed % palettes.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="${wall}"/>
  <rect x="0" y="880" width="1600" height="320" fill="${light}" opacity=".55"/>
  <rect x="980" y="140" width="460" height="560" rx="10" fill="#dfeef5" stroke="${dark}" stroke-width="14"/>
  <line x1="1210" y1="140" x2="1210" y2="700" stroke="${dark}" stroke-width="10"/>
  <line x1="980" y1="420" x2="1440" y2="420" stroke="${dark}" stroke-width="10"/>
  <circle cx="1330" cy="270" r="60" fill="#fff6d6"/>
  <rect x="220" y="640" width="900" height="36" rx="8" fill="${dark}"/>
  <rect x="270" y="676" width="24" height="260" fill="${dark}"/>
  <rect x="1046" y="676" width="24" height="260" fill="${dark}"/>
  <rect x="470" y="400" width="380" height="230" rx="14" fill="#1f2d27"/>
  <rect x="490" y="420" width="340" height="190" rx="6" fill="${light}"/>
  <rect x="640" y="620" width="40" height="24" fill="#1f2d27"/>
  <rect x="330" y="604" width="110" height="34" rx="6" fill="${accent}"/>
  <path d="M190 940 q-30 -170 40 -260 q30 140 -10 260z" fill="${dark}" opacity=".85"/>
  <path d="M190 940 q60 -160 140 -200 q-30 150 -110 200z" fill="${dark}" opacity=".65"/>
  <rect x="150" y="930" width="110" height="110" rx="14" fill="${accent}"/>
  <rect x="560" y="760" width="240" height="40" rx="12" fill="${accent}" opacity=".9"/>
  <rect x="660" y="800" width="30" height="150" fill="#1f2d27"/>
  <text x="80" y="140" font-family="DejaVu Sans, Arial" font-size="96" font-weight="700" fill="${dark}">${esc(label)}</text>
  <text x="84" y="200" font-family="DejaVu Sans, Arial" font-size="34" fill="${dark}" opacity=".7">Business Village</text>
</svg>`;
}

export function roomSvg(label: string, seed: number) {
  const [dark, light, wall, accent] = palettes[seed % palettes.length];
  const chairs = Array.from({ length: 4 }, (_, i) => {
    const x = 420 + i * 220;
    return `<rect x="${x}" y="560" width="120" height="110" rx="20" fill="${accent}"/><rect x="${x}" y="880" width="120" height="110" rx="20" fill="${accent}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="${wall}"/>
  <rect x="0" y="820" width="1600" height="380" fill="${light}" opacity=".5"/>
  <rect x="540" y="150" width="620" height="340" rx="16" fill="#1f2d27"/>
  <rect x="566" y="176" width="568" height="288" rx="8" fill="${light}"/>
  <rect x="620" y="230" width="260" height="22" rx="6" fill="${dark}"/>
  <rect x="620" y="280" width="420" height="16" rx="6" fill="${dark}" opacity=".5"/>
  <rect x="620" y="314" width="360" height="16" rx="6" fill="${dark}" opacity=".5"/>
  <rect x="160" y="210" width="280" height="380" rx="8" fill="#ffffff" stroke="${dark}" stroke-width="10"/>
  <path d="M200 300 l60 40 l50 -70 l70 90" stroke="${accent}" stroke-width="10" fill="none"/>
  ${chairs}
  <rect x="360" y="680" width="980" height="190" rx="95" fill="${dark}"/>
  <text x="80" y="1110" font-family="DejaVu Sans, Arial" font-size="92" font-weight="700" fill="${dark}">${esc(label)}</text>
</svg>`;
}

export function heroSvg(seed: number) {
  const [dark, light, wall, accent] = palettes[seed % palettes.length];
  const desks = Array.from({ length: 3 }, (_, i) => {
    const x = 160 + i * 460;
    return `<rect x="${x}" y="700" width="360" height="26" rx="8" fill="${dark}"/><rect x="${x + 90}" y="540" width="180" height="140" rx="10" fill="#1f2d27"/><rect x="${x + 104}" y="554" width="152" height="112" rx="4" fill="${light}"/><rect x="${x + 120}" y="780" width="120" height="100" rx="18" fill="${accent}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs>
  <rect width="1600" height="1200" fill="url(#g)"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${120 + i * 360}" y="110" width="300" height="340" rx="10" fill="#e3f0f4" stroke="${dark}" stroke-width="10"/>`).join("")}
  ${desks}
  <path d="M1480 1000 q-40 -220 40 -330 q40 170 -10 330z" fill="${dark}"/>
  <rect x="1420" y="990" width="130" height="130" rx="16" fill="${accent}"/>
  <rect x="0" y="1000" width="1600" height="200" fill="${dark}" opacity=".12"/>
</svg>`;
}

export async function toWebp(svg: string) {
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}
