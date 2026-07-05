// Original HUD iconography: plain geometric SVG built in-repo. These deliberately
// do not copy Fortnite's icon art; they convey the same information (piece type,
// material, tool) with simple original shapes.

const stroke = 'fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"';
const solid = 'fill="currentColor"';

function svg(body: string): string {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// --- Piece icons ---

export const ICON_WALL = svg(`<rect x="26" y="14" width="48" height="72" rx="4" ${stroke}/><line x1="50" y1="14" x2="50" y2="86" ${stroke}/>`);

// A floor slab drawn in slight perspective (a parallelogram).
export const ICON_FLOOR = svg(`<path d="M18 62 L46 40 L82 40 L54 62 Z" ${stroke}/><path d="M54 62 L54 72 L82 50 L82 40" ${stroke}/>`);

// A three-step staircase.
export const ICON_STAIRS = svg(`<path d="M20 80 L20 60 L44 60 L44 40 L68 40 L68 20 L84 20" ${stroke}/>`);

// A pyramid / cone roof.
export const ICON_ROOF = svg(`<path d="M50 18 L84 74 L16 74 Z" ${stroke}/><line x1="50" y1="18" x2="50" y2="74" ${stroke}/>`);

// The Mattock: an angled harvesting-tool head on a handle.
export const ICON_MATTOCK = svg(`<line x1="38" y1="82" x2="60" y2="30" ${stroke}/><path d="M40 30 Q60 20 78 34" ${stroke}/>`);

// --- Material icons ---

export const ICON_WOOD = svg(
  `<rect x="20" y="20" width="60" height="60" rx="6" ${solid} opacity="0.18"/>` +
    `<g ${stroke} stroke-width="4">` +
    `<line x1="34" y1="24" x2="34" y2="76"/><line x1="50" y1="24" x2="50" y2="76"/><line x1="66" y1="24" x2="66" y2="76"/></g>`,
);

export const ICON_STONE = svg(
  `<rect x="20" y="20" width="60" height="60" rx="6" ${solid} opacity="0.18"/>` +
    `<g ${stroke} stroke-width="4">` +
    `<line x1="20" y1="42" x2="80" y2="42"/><line x1="20" y1="60" x2="80" y2="60"/>` +
    `<line x1="42" y1="20" x2="42" y2="42"/><line x1="60" y1="42" x2="60" y2="60"/><line x1="42" y1="60" x2="42" y2="80"/></g>`,
);

export const ICON_METAL = svg(
  `<rect x="20" y="20" width="60" height="60" rx="6" ${solid} opacity="0.18"/>` +
    `<rect x="20" y="20" width="60" height="60" rx="6" ${stroke} stroke-width="4"/>` +
    `<g ${solid}>` +
    `<circle cx="30" cy="30" r="3.4"/><circle cx="70" cy="30" r="3.4"/>` +
    `<circle cx="30" cy="70" r="3.4"/><circle cx="70" cy="70" r="3.4"/></g>`,
);

// --- Crosshairs ---

// Build: a square bracket frame. Edit: a ring. Mattock: a dot with ticks.
export const CROSSHAIR_BUILD = svg(
  `<g ${stroke} stroke-width="8">` +
    `<path d="M14 30 L14 14 L30 14"/><path d="M70 14 L86 14 L86 30"/>` +
    `<path d="M86 70 L86 86 L70 86"/><path d="M30 86 L14 86 L14 70"/></g>`,
);
export const CROSSHAIR_EDIT = svg(`<circle cx="50" cy="50" r="30" ${stroke} stroke-width="8"/>`);
export const CROSSHAIR_MATTOCK = svg(
  `<circle cx="50" cy="50" r="6" ${solid}/>` +
    `<g ${stroke} stroke-width="6"><line x1="50" y1="20" x2="50" y2="34"/><line x1="50" y1="66" x2="50" y2="80"/>` +
    `<line x1="20" y1="50" x2="34" y2="50"/><line x1="66" y1="50" x2="80" y2="50"/></g>`,
);
