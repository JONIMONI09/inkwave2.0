// INKWAVE UI — inline SVG icon set, input glyphs, logo and illustrations.
// Everything is a markup string (cheap to clone via innerHTML) using currentColor / CSS classes for team ink:
//   .iw-fa = accent/team A ink, .iw-fb = accent/team B ink (see ui.css).
import { esc, splatShape, blobPath } from './ui-util.js';

const K = '#15121c';        // outline ink
const DK = '#2b2735';       // dark plastic
const LT = '#e4e8ef';       // light metal/plastic
const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const svg = (body, vb = '0 0 64 64', cls = '') => `<svg class="iw-ico ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

// ------------------------------------------------------------------ weapons / subs / specials (two-tone, ink = currentColor)
export const WEAPON_ICONS = {
  shooter: svg(`<g ${O}>
      <path d="M17 37 L13.5 53.5 Q13 57 16.5 57 L22.5 57 Q25.5 57 26 54 L29 38 Z" fill="${DK}"/>
      <rect x="17.5" y="7.5" width="18" height="17" rx="7" fill="#f4f8ff"/>
      <path d="M8 26.5 Q8 22 12.5 22 L44 22 Q48.5 22 48.5 26.5 L48.5 35.5 Q48.5 40 44 40 L12.5 40 Q8 40 8 35.5 Z" fill="currentColor"/>
      <rect x="47" y="25.5" width="9" height="11" rx="2.5" fill="${LT}"/>
      <rect x="54.5" y="23" width="5.5" height="16" rx="2" fill="${DK}"/>
      <path d="M29.5 40.5 Q31 47 36.5 47" fill="none"/>
    </g>
    <rect x="20.5" y="14.5" width="12" height="8" rx="3.5" fill="currentColor"/>
    <path d="M13.5 27 L39 27" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    <circle cx="22.5" cy="12" r="1.9" fill="#fff"/>`),
  roller: svg(`<path d="M31 33 L51 6" stroke="${K}" stroke-width="9" stroke-linecap="round"/>
    <path d="M31 33 L51 6" stroke="${LT}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M44 15.5 L51 6" stroke="${K}" stroke-width="10" stroke-linecap="round"/>
    <path d="M44 15.5 L51 6" stroke="${DK}" stroke-width="4.2" stroke-linecap="round"/>
    <g ${O}>
      <path d="M18 38 L18 31 Q18 29 20 29 L42 29 Q44 29 44 31 L44 38" fill="none" stroke-width="3.4"/>
      <rect x="8" y="35" width="48" height="19" rx="8" fill="currentColor"/>
      <rect x="4" y="37" width="7" height="15" rx="2.5" fill="${DK}"/>
      <rect x="53" y="37" width="7" height="15" rx="2.5" fill="${DK}"/>
      <path d="M22 53.5 Q22 60 25 60 Q28 60 28 53.5" fill="currentColor"/>
      <path d="M40 53.5 Q40 57 42 57 Q44 57 44 53.5" fill="currentColor"/>
    </g>
    <path d="M14 40.5 L50 40.5" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  charger: svg(`<g ${O}>
      <path d="M3.5 29 L15 26 L16.5 40 L7 46.5 Q3.5 47 3.5 43.5 Z" fill="${DK}"/>
      <path d="M22 37.5 L19 50.5 Q18.5 53.5 21.5 53.5 L26.5 53.5 L30 37.5 Z" fill="${DK}"/>
      <rect x="35" y="28" width="23" height="6.5" rx="2" fill="${LT}"/>
      <rect x="56" y="26" width="5.5" height="10.5" rx="1.8" fill="${DK}"/>
      <rect x="12.5" y="24.5" width="25" height="14" rx="4.5" fill="currentColor"/>
      <rect x="23" y="20.5" width="5" height="5" fill="${DK}"/>
      <rect x="15" y="12.5" width="22" height="9" rx="3.5" fill="${DK}"/>
      <rect x="40" y="25.5" width="3.6" height="11.5" rx="1.6" fill="currentColor"/>
      <rect x="46" y="25.5" width="3.6" height="11.5" rx="1.6" fill="currentColor"/>
    </g>
    <circle cx="34" cy="17" r="2.6" fill="currentColor"/>
    <path d="M17 29 L33 29" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  blaster: svg(`<g ${O}>
      <path d="M17 41 L13.5 55 Q13 58.5 16.5 58.5 L22.5 58.5 L27 43 Z" fill="${DK}"/>
      <path d="M15 18 Q24.5 5.5 34 18" fill="none" stroke-width="4.2"/>
      <path d="M35 21.5 L53.5 19.5 Q60 19.5 60 26 L60 36 Q60 42.5 53.5 42.5 L35 40.5 Z" fill="${LT}"/>
      <ellipse cx="58" cy="31" rx="3.6" ry="10.5" fill="${DK}"/>
      <circle cx="24.5" cy="30.5" r="15.5" fill="currentColor"/>
      <rect x="36.5" y="20.5" width="5.5" height="21" rx="2.2" fill="currentColor"/>
    </g>
    <ellipse cx="19.5" cy="24.5" rx="5.2" ry="3.6" fill="#fff" fill-opacity=".6"/>`),
  bucket: svg(`<g ${O}>
      <path d="M14.5 43 L11 55.5 Q10.5 59 14 59 L20 59 L24 45 Z" fill="${DK}"/>
      <g transform="rotate(-12 30 33)">
        <path d="M17 22 Q17 9 29 9 Q38.5 9 41 17" fill="none" stroke-width="3.6"/>
        <path d="M11 26.5 Q11 22.3 15 21.8 L42 17 L42 49 L15 44.2 Q11 43.7 11 39.5 Z" fill="${LT}"/>
        <path d="M42 43 L56.5 46.5 Q59.5 47.5 57.5 50 L46 51 Q42.5 50.5 42 47 Z" fill="${DK}"/>
        <ellipse cx="42" cy="33" rx="6" ry="16" fill="${DK}"/>
        <path d="M37.5 38 Q42 33 48 36.5 Q53 30 59 33 Q62 36.5 58.5 41.5 Q55.5 46.5 50 47.5 Q44 48.5 40.5 45 Q37.5 42 37.5 38 Z" fill="currentColor"/>
        <circle cx="60.5" cy="27" r="2.4" fill="currentColor" stroke-width="2.2"/>
      </g>
    </g>
    <g transform="rotate(-12 30 33)">
      <path d="M18.5 37.5 L32 37.5" stroke="${K}" stroke-width="7" stroke-linecap="round"/>
      <path d="M18.5 37.5 L32 37.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M16.5 27.5 L35 24.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    </g>`),
  spinner: svg(`<g ${O}>
      <path d="M18 22 Q18 11 26 11 L30 11 Q37 11 37 20" fill="none" stroke-width="4.2"/>
      <path d="M19.5 40 L16.5 52.5 Q16 55.5 19 55.5 L24 55.5 L27.5 40 Z" fill="${DK}"/>
      <rect x="35" y="42" width="10" height="5.5" rx="2.7" fill="${DK}"/>
      <rect x="3" y="22.5" width="17" height="17" rx="6.5" fill="currentColor"/>
      <rect x="15" y="21" width="21" height="20" rx="5" fill="${LT}"/>
      <rect x="18.5" y="17.5" width="13" height="5.5" rx="2.5" fill="currentColor"/>
      <rect x="41" y="21" width="18" height="5" rx="2" fill="${LT}"/>
      <rect x="41" y="28.5" width="18" height="5" rx="2" fill="${LT}"/>
      <rect x="41" y="36" width="18" height="5" rx="2" fill="${LT}"/>
      <rect x="32.5" y="18.5" width="10" height="25" rx="4" fill="${DK}"/>
      <rect x="47.5" y="19.5" width="3.8" height="23" rx="1.5" fill="${DK}"/>
      <rect x="55" y="19.5" width="3.8" height="23" rx="1.5" fill="${DK}"/>
    </g>
    <path d="M36.5 19.5 L36.5 42.5" stroke="currentColor" stroke-width="2.4"/>
    <path d="M7.5 27.5 L15 27.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>
    <path d="M19 26 L32 26" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  twins: svg(`${[[22, 1.5], [2.5, 27]].map(([x, y]) => `<g transform="translate(${x} ${y})"><g ${O}>
      <path d="M9 19 L6.5 30.5 Q6 33.5 9 33.5 L14 33.5 L17 20 Z" fill="${DK}"/>
      <rect x="18.5" y="19.5" width="6.5" height="11" rx="3" fill="currentColor"/>
      <rect x="3" y="11" width="28" height="12.5" rx="4.5" fill="${LT}"/>
      <rect x="30" y="12.5" width="5.5" height="9.5" rx="2" fill="${DK}"/>
      <rect x="34.5" y="10.5" width="4.5" height="13.5" rx="1.8" fill="currentColor"/>
      <circle cx="12.5" cy="9.5" r="6.5" fill="currentColor"/>
    </g>
    <circle cx="10.5" cy="7.5" r="1.9" fill="#fff" fill-opacity=".65"/>
    <path d="M20 15.5 L28 15.5" stroke="#fff" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/></g>`).join('')}`),
  brush: svg(`<path d="M32 31 L50 8.5" stroke="${K}" stroke-width="9" stroke-linecap="round"/>
    <path d="M32 31 L50 8.5" stroke="${LT}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M43.5 16.5 L50 8.5" stroke="${K}" stroke-width="10" stroke-linecap="round"/>
    <path d="M43.5 16.5 L50 8.5" stroke="${DK}" stroke-width="4.2" stroke-linecap="round"/>
    <g ${O}>
      <circle cx="51.5" cy="6" r="3.8" fill="${LT}"/>
      <path d="M9 42 L55 42 L55.5 52 Q55 57.5 51.5 55 Q49 59.5 45.5 55.5 Q43 59.5 39.5 55.5 Q37 59.5 33.5 55.5 Q31 59.5 27.5 55.5 Q25 59.5 21.5 55.5 Q19 59.5 15.5 55.5 Q13 59.5 10 55 Q8 54 8.5 52 Z" fill="currentColor"/>
      <rect x="7" y="37" width="50" height="7.5" rx="2.5" fill="${DK}"/>
      <rect x="4.5" y="27.5" width="55" height="11.5" rx="4.5" fill="${LT}"/>
      <circle cx="32" cy="29.5" r="4.6" fill="${DK}"/>
    </g>
    <path d="M16 46.5 L16 52 M24 46.5 L24 52.5 M32 46.5 L32 52 M40 46.5 L40 52.5 M48 46.5 L48 52" stroke="#fff" stroke-opacity=".45" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M9.5 31.5 L25 31.5 M39 31.5 L54.5 31.5" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  // upstream's arsenal
  dualies: svg(`<g ${O}>
      <g transform="translate(15 16)">
        <path d="M9 21 L6 36.5 Q5.6 39 8 39 L13 39 Q15 39 15.5 37 L18 22 Z" fill="${DK}"/>
        <path d="M17 4 L23 -1.5 L26 4 Z" fill="currentColor"/>
        <rect x="3" y="4" width="33" height="12" rx="5" fill="${LT}"/>
        <rect x="34.5" y="7" width="8" height="6.5" rx="2" fill="${DK}"/>
        <path d="M5 16.5 L32 16.5 L30 21.5 L7 21.5 Z" fill="${DK}"/>
      </g>
      <path d="M11 25 L7.5 41.5 Q7 44 9.5 44 L15 44 Q17 44 17.5 42 L20.5 26 Z" fill="${DK}"/>
      <path d="M19 8 L25.5 2 L28.5 8 Z" fill="currentColor"/>
      <rect x="4.5" y="8" width="35" height="13" rx="5.5" fill="${LT}"/>
      <rect x="38" y="11" width="9" height="7" rx="2.2" fill="${DK}"/>
      <path d="M6.5 21 L35 21 L32.5 26 L9 26 Z" fill="${DK}"/>
      <rect x="15" y="12" width="9" height="4" rx="2" fill="currentColor"/>
    </g>
    <path d="M9 12.5 L30 12.5" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>`),
  // bucket mid-heave: ink wave curling out over the lip with a trail of globs
  slosher: svg(`<g ${O}>
      <path d="M10 22 L7 25 Q6 27 8.5 28 L12 29" fill="none" stroke-width="3.4"/>
      <path d="M12 24 L41 20 L44 51 Q44.5 55 40.5 55.5 L22.5 58 Q18.5 58.5 18 54.5 Z" fill="${LT}"/>
      <path d="M14.4 34 L42.4 30.2 L43.2 38.6 L15.6 42.4 Z" fill="currentColor"/>
      <path d="M11 24 Q26 12 42 19.5 Q49 11 58 13 Q53 17 52.5 22 Q51 27 45 27 Q38 26 33 22.5 Q22 26 11 24 Z" fill="currentColor"/>
      <circle cx="56" cy="25" r="3.2" fill="currentColor"/><circle cx="59.5" cy="33" r="2.3" fill="currentColor"/>
    </g>
    <path d="M19 45 L38 42.6" stroke="${K}" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>
    <path d="M40 15.5 Q47 11.5 53 13" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>`),
  // rotary splatling: windowed ink drum on top, housing, six-barrel cluster, grip + foregrip
  splatling: svg(`<g ${O}>
      <path d="M14 38 L11 51.5 Q10.6 54 13 54 L18 54 Q20 54 20.5 52 L23 39 Z" fill="${DK}"/>
      <path d="M32 38 L31 47 Q31 49.5 33.5 49.5 L36 49.5 Q38 49.5 38 47.5 L38.5 38 Z" fill="${DK}"/>
      <rect x="37" y="26.5" width="23" height="11" rx="2.5" fill="${DK}"/>
      <rect x="6" y="24" width="34" height="15.5" rx="5" fill="${LT}"/>
      <circle cx="21" cy="15" r="10.5" fill="currentColor"/>
      <rect x="40" y="24.5" width="4.4" height="15" rx="1.6" fill="${LT}"/>
      <rect x="51.5" y="25" width="4" height="14" rx="1.6" fill="${LT}"/>
    </g>
    <path d="M41 30 L60 30 M41 34 L60 34" stroke="${LT}" stroke-width="1.6"/>
    <circle cx="21" cy="15" r="4.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.2"/>
    <path d="M11 29.5 L33 29.5" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>`),
};

export const SUB_ICONS = {
  bomb: svg(`<g ${O}>
      <rect x="26.5" y="6" width="11" height="10" rx="3" fill="${DK}"/>
      <path d="M32 13 C38 13 53 39 53 46 C53 53 46 56.5 32 56.5 C18 56.5 11 53 11 46 C11 39 26 13 32 13 Z" fill="currentColor"/>
    </g>
    <circle cx="32" cy="43" r="4.6" fill="#fff" stroke="${K}" stroke-width="2.5"/>
    <path d="M25 29 Q21.5 35 19.5 42" stroke="#fff" stroke-opacity=".6" stroke-width="3.4" fill="none" stroke-linecap="round"/>`),
  // Cling Charge: dome charge on a gooey suction pad, knob + fuse light on top, ink window on the flank
  sticky: svg(`<g ${O}>
      <rect x="27" y="6.5" width="10" height="13" rx="3.5" fill="${DK}"/>
      <path d="M10.5 39 Q10.5 18.5 32 18 Q53.5 18.5 53.5 39 Z" fill="${LT}"/>
      <rect x="37" y="25.5" width="11.5" height="8" rx="3.5" fill="currentColor"/>
      <path d="M4.5 51.5 Q4.5 43 13 42.5 L51 42.5 Q59.5 43 59.5 51.5 Q57 57 52.5 54.5 Q50 60.5 44.5 55.5 Q40 58.5 36 55 Q32 60.5 27.5 55 Q23.5 58.5 19.5 55.5 Q14 60.5 11.5 54.5 Q7 57 4.5 51.5 Z" fill="currentColor"/>
      <rect x="7.5" y="37" width="49" height="8" rx="3" fill="${DK}"/>
    </g>
    <circle cx="32" cy="6" r="3.6" fill="#fff" stroke="${K}" stroke-width="2.4"/>
    <path d="M17 32 Q18 25.5 24.5 22.5" stroke="#fff" stroke-opacity=".6" stroke-width="3.2" fill="none" stroke-linecap="round"/>`),
  // Pop Pellet: tilted capsule, ink core band, trigger nub on the nose, pop sparks
  burst: svg(`<g transform="rotate(-32 32 34)"><g ${O}>
      <path d="M13 29 L8 22 L18 26 Z M13 43 L8 50 L18 46 Z" fill="${LT}"/>
      <rect x="4.5" y="30.5" width="9" height="11" rx="3" fill="${DK}"/>
      <path d="M25 22 L21 22 Q12 22 12 36 Q12 50 21 50 L25 50 Z" fill="${LT}"/>
      <rect x="24" y="22" width="16" height="28" fill="currentColor"/>
      <path d="M39 22 L43 22 Q52 22 52 36 Q52 50 43 50 L39 50 Z" fill="${LT}"/>
      <rect x="22" y="20.5" width="4.5" height="31" rx="2" fill="${DK}"/>
      <rect x="37.5" y="20.5" width="4.5" height="31" rx="2" fill="${DK}"/>
      <rect x="51" y="30" width="6.5" height="12" rx="2.5" fill="${DK}"/>
    </g>
    <path d="M28 27 L36 27" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/></g>
    <g stroke="${K}" stroke-width="6.5" stroke-linecap="round"><path d="M50 9 L52.5 4 M56.5 14 L61 11 M58.5 21.5 L62.5 22"/></g>
    <g stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M50 9 L52.5 4 M56.5 14 L61 11 M58.5 21.5 L62.5 22"/></g>`),
  // Skitter Bomb: side view — ink shell on a dark chassis, cyclops eye, bumper, wind-up key, speed lines
  seeker: svg(`<g stroke="${K}" stroke-width="6.5" stroke-linecap="round"><path d="M2.5 27 L8 27 M2.5 35 L6 35"/></g>
    <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M2.5 27 L8 27 M2.5 35 L6 35"/></g>
    <g ${O}>
      <path d="M31 17 L31 11" fill="none"/>
      <path d="M23 8.5 Q23 4.5 27 4.5 L35 4.5 Q39 4.5 39 8.5 Q39 12.5 35 12.5 L27 12.5 Q23 12.5 23 8.5 Z" fill="${LT}"/>
      <path d="M10 41 Q10 18.5 30 17.5 L38 17.5 Q57 18.5 57 39 L57 41 Z" fill="currentColor"/>
      <rect x="6.5" y="38" width="52" height="9" rx="4" fill="${DK}"/>
      <rect x="54" y="36.5" width="8" height="11" rx="3" fill="${LT}"/>
      <circle cx="18" cy="50" r="8.5" fill="${DK}"/>
      <circle cx="46" cy="50" r="8.5" fill="${DK}"/>
      <circle cx="46" cy="29" r="7.5" fill="#fff"/>
    </g>
    <circle cx="18" cy="50" r="3.2" fill="${LT}"/><circle cx="46" cy="50" r="3.2" fill="${LT}"/>
    <circle cx="47.5" cy="29" r="3.4" fill="${K}"/>
    <path d="M16 31 Q17.5 24.5 24 22.5" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  // Echo Orb: white sphere, glowing ink band, antenna with ink tip, sonar arcs
  scan: svg(`<g fill="none" stroke="${K}" stroke-width="6.5" stroke-linecap="round"><path d="M9.5 15 Q4.5 21 5 29 M54.5 15 Q59.5 21 59 29"/></g>
    <g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9.5 15 Q4.5 21 5 29 M54.5 15 Q59.5 21 59 29"/></g>
    <g ${O}>
      <path d="M32 13 L32 7" fill="none"/>
      <rect x="27.5" y="12" width="9" height="8" rx="2.5" fill="${DK}"/>
      <circle cx="32" cy="39" r="19.5" fill="${LT}"/>
      <path d="M12.6 36.5 Q32 43.5 51.4 36.5 L51.2 43 Q32 50.5 12.8 43 Z" fill="currentColor"/>
      <circle cx="32" cy="5.5" r="3.4" fill="currentColor" stroke-width="2.4"/>
    </g>
    <path d="M19 32 Q20 26 26 23.5" stroke="#fff" stroke-opacity=".7" stroke-width="3.2" fill="none" stroke-linecap="round"/>`),
  // Drip Curtain: low rail with dark end caps and an ink window, a wavy wall of ink rising from it
  curtain: svg(`<g ${O}>
      <path d="M9 44 L9 16 Q12 9.5 15.5 14.5 Q19.5 6 24 13 Q28 5 32.5 12.5 Q37 6 41 13 Q45 7.5 48.5 14 Q52 10 55 15.5 L55 44 Z" fill="currentColor"/>
      <rect x="5" y="42" width="54" height="14" rx="5" fill="${LT}"/>
      <rect x="2.5" y="39.5" width="9" height="19" rx="3" fill="${DK}"/>
      <rect x="52.5" y="39.5" width="9" height="19" rx="3" fill="${DK}"/>
      <rect x="17" y="46.5" width="30" height="5.5" rx="2.7" fill="currentColor"/>
    </g>
    <path d="M18 21 L18 35 M32 19 L32 31 M44 21 L44 36" stroke="#fff" stroke-opacity=".45" stroke-width="2.6" stroke-linecap="round"/>`),
  // Twirl Sprinkler: domed base with a team ring, riser, hub with a big ink dome, arms flinging ink droplets
  sprinkler: svg(`<path d="M30 21.5 L12.5 19.5 Q7 19 6.5 25 M34 21.5 L51.5 19.5 Q57 19 57.5 25" fill="none" stroke="${K}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 21.5 L12.5 19.5 Q7 19 6.5 25 M34 21.5 L51.5 19.5 Q57 19 57.5 25" fill="none" stroke="${DK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <g ${O}>
      <rect x="27.5" y="24" width="9" height="24" rx="3" fill="${DK}"/>
      <path d="M7 57 Q7 45.5 32 45 Q57 45.5 57 57 Z" fill="${LT}"/>
      <rect x="5" y="54.5" width="54" height="6" rx="3" fill="${DK}"/>
      <rect x="20" y="17.5" width="24" height="9.5" rx="4" fill="${DK}"/>
      <path d="M22.5 19 Q22.5 6 32 6 Q41.5 6 41.5 19 Z" fill="currentColor"/>
      <circle cx="5.5" cy="33" r="3.6" fill="currentColor" stroke-width="2.5"/>
      <circle cx="58.5" cy="33" r="3.6" fill="currentColor" stroke-width="2.5"/>
      <circle cx="10" cy="40.5" r="2.7" fill="currentColor" stroke-width="2.3"/>
      <circle cx="54" cy="40.5" r="2.7" fill="currentColor" stroke-width="2.3"/>
    </g>
    <path d="M13.5 53 Q32 47.5 50.5 53" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M27 13 Q28.5 9.5 32 9.2" stroke="#fff" stroke-opacity=".65" stroke-width="2.8" fill="none" stroke-linecap="round"/>`),
  // Lurk Mine: flat disc half-sunk in an ink puddle, pressure plate, ink seams
  mine: svg(`<g ${O}>
      <path d="M3 52 Q2 44.5 12 44 L52 44 Q62 44.5 61 52 Q60.5 58.5 50 58 Q46 61.5 40 58.5 L24 58.5 Q18 61.5 14 58 Q3.5 58.5 3 52 Z" fill="currentColor"/>
      <path d="M5 33 L5 40 Q5 51.5 32 51.5 Q59 51.5 59 40 L59 33 Z" fill="${DK}"/>
      <ellipse cx="32" cy="33" rx="27" ry="12.5" fill="${LT}"/>
      <ellipse cx="32" cy="32" rx="11" ry="5" fill="${DK}"/>
    </g>
    <ellipse cx="32" cy="31" rx="7" ry="2.8" fill="${LT}"/>
    <g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round">
      <ellipse cx="32" cy="32.5" rx="15.5" ry="7"/>
      <path d="M15 29 L9.5 27 M49 29 L54.5 27 M20 38.5 L15.5 42 M44 38.5 L48.5 42 M32 40 L32 44.5"/>
    </g>
    <path d="M13 22.5 Q18 21 23 21" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  // Hop Beacon: weighted base with a team band, mast with a hop spring, dish crowned by a glowing ink light
  beacon: svg(`<path d="M32 47 L32 24" stroke="${K}" stroke-width="8" stroke-linecap="round"/>
    <path d="M32 47 L32 24" stroke="${LT}" stroke-width="3" stroke-linecap="round"/>
    <path d="M25.5 33 L38.5 30 L25.5 27 L38.5 24" fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M25.5 33 L38.5 30 L25.5 27 L38.5 24" fill="none" stroke="${LT}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <g ${O}>
      <path d="M13 57 Q13 46.5 32 46 Q51 46.5 51 57 Z" fill="${DK}"/>
      <rect x="10" y="53.5" width="44" height="7.5" rx="3" fill="currentColor"/>
      <path d="M20.5 15.5 Q20.5 2.5 32 2.5 Q43.5 2.5 43.5 15.5 Z" fill="currentColor"/>
      <path d="M11 14 L53 14 Q49.5 24.5 32 24.5 Q14.5 24.5 11 14 Z" fill="${LT}"/>
    </g>
    <g stroke="${K}" stroke-width="6.5" stroke-linecap="round"><path d="M14.5 7.5 L10 4.5 M49.5 7.5 L54 4.5"/></g>
    <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M14.5 7.5 L10 4.5 M49.5 7.5 L54 4.5"/></g>
    <path d="M27 51.5 L32 47.5 L37 51.5" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 10 Q27.5 6.5 31.5 6.2" stroke="#fff" stroke-opacity=".7" stroke-width="2.8" fill="none" stroke-linecap="round"/>`),
  // Murk Bomb: dark round bomb, cream vent collar with ink slots, swirling ink porthole, murk puffs
  mist: svg(`<g ${O}>
      <path d="M2.5 53 Q1 45.5 7.5 45 Q8 38.5 14.5 39.5 Q17.5 35 22 38.5 L21 58 Q14 61 9 58 Q2.5 58.5 2.5 53 Z M61.5 53 Q63 45.5 56.5 45 Q56 38.5 49.5 39.5 Q46.5 35 42 38.5 L43 58 Q50 61 55 58 Q61.5 58.5 61.5 53 Z" fill="currentColor"/>
      <circle cx="6.5" cy="31.5" r="3.4" fill="currentColor" stroke-width="2.4"/>
      <circle cx="57.5" cy="29" r="2.8" fill="currentColor" stroke-width="2.3"/>
      <rect x="27" y="5.5" width="10" height="10" rx="3" fill="${DK}"/>
      <circle cx="32" cy="37" r="21.5" fill="${DK}"/>
      <path d="M11.3 30 Q32 37 52.7 30 L53.4 37.5 Q32 45 10.6 37.5 Z" fill="${LT}"/>
      <circle cx="32" cy="48" r="7.5" fill="currentColor" stroke-width="2.6"/>
    </g>
    <g fill="currentColor"><rect x="17" y="33" width="4" height="5.5" rx="1.5"/><rect x="30" y="35.5" width="4" height="5.5" rx="1.5"/><rect x="43" y="33" width="4" height="5.5" rx="1.5"/></g>
    <path d="M28.5 48.5 Q28.5 44.5 32.5 44.5 Q36 44.8 35.8 48 Q35.5 50.5 32.8 50.3 Q30.8 50 31.2 48" fill="none" stroke="${K}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M18 27 Q20.5 21.5 26 19.5" stroke="#fff" stroke-opacity=".45" stroke-width="3" fill="none" stroke-linecap="round"/>`),
};

export const SPECIAL_ICONS = {
  slam: svg(`<g ${O}>
      <ellipse cx="32" cy="51" rx="25" ry="7" fill="none" stroke="currentColor" stroke-width="4.6"/>
      <ellipse cx="32" cy="51" rx="25" ry="7" fill="none" stroke-width="1.4"/>
      <path d="M32 45 L15 25.5 L24.5 25.5 L24.5 5 L39.5 5 L39.5 25.5 L49 25.5 Z" fill="currentColor"/>
      <circle cx="7" cy="36" r="3.4" fill="currentColor"/>
      <circle cx="57" cy="36" r="3.4" fill="currentColor"/>
      <circle cx="12" cy="27" r="2.2" fill="currentColor"/>
      <circle cx="52" cy="27" r="2.2" fill="currentColor"/>
    </g>
    <path d="M28.5 9 L28.5 26" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`),
  storm: svg(`<g ${O}>
      <path d="M20 42 L16 54" stroke="${K}" stroke-width="8"/><path d="M20 42 L16 54" stroke="currentColor" stroke-width="3.6"/>
      <path d="M32 42 L28 57" stroke="${K}" stroke-width="8"/><path d="M32 42 L28 57" stroke="currentColor" stroke-width="3.6"/>
      <path d="M44 42 L40 54" stroke="${K}" stroke-width="8"/><path d="M44 42 L40 54" stroke="currentColor" stroke-width="3.6"/>
      <path d="M15.5 38 Q5 38 6 28 Q7 19.5 16.5 20.5 Q18.5 8.5 31 8.5 Q43 8.5 46 19.5 Q58 18.5 58 29 Q58 38 48.5 38 Z" fill="currentColor"/>
      <path d="M33 21 L27 31 L33 31 L29 40" fill="none" stroke="#fff" stroke-width="3"/>
    </g>
    <path d="M14 26 Q15 22.5 19 23" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  // Bomb Barrage: a volley of splat bombs dropping in (falling streaks above a cluster of three)
  barrage: svg(`<g stroke-linecap="round"><path d="M12 3 L12 11 M32 2 L32 8 M52 3 L52 11" stroke="${K}" stroke-width="6.5"/><path d="M12 3 L12 11 M32 2 L32 8 M52 3 L52 11" stroke="currentColor" stroke-width="2.8"/></g>` +
    [[16.5, 34, 0.48, -14], [47.5, 34, 0.48, 14], [32, 42, 0.62, 0]].map(([x, y, s, r]) => {
      const w = (v) => (v / s).toFixed(2);
      return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s}) translate(-32 -36)">
      <g stroke="${K}" stroke-width="${w(3)}" stroke-linejoin="round"><rect x="26.5" y="6" width="11" height="10" rx="3" fill="${DK}"/>
        <path d="M32 13 C38 13 53 39 53 46 C53 53 46 56.5 32 56.5 C18 56.5 11 53 11 46 C11 39 26 13 32 13 Z" fill="currentColor"/></g>
      <circle cx="32" cy="43" r="4.8" fill="#fff" stroke="${K}" stroke-width="${w(2.4)}"/>
      <path d="M25 29 Q21.5 35 19.5 42" stroke="#fff" stroke-opacity=".6" stroke-width="${w(3.2)}" fill="none" stroke-linecap="round"/></g>`;
    }).join('')),
  // Bubble Guard: a squid tucked inside a shield bubble
  bubbler: svg(`<circle cx="32" cy="32" r="27" fill="currentColor" fill-opacity=".2" stroke="${K}" stroke-width="7.5"/>
    <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="3"/>
    <g transform="translate(32 34) scale(0.56) translate(-32 -32)"><g stroke="${K}" stroke-width="5.5" stroke-linejoin="round">
      <path d="M22 44 Q19 53 13 58 Q20 61 26 50 Z M29 46 Q28.5 55 25 61 Q32.5 61 33 48 Z M35 46 Q35.5 55 39 61 Q31.5 61 31 48 Z M42 44 Q45 53 51 58 Q44 61 38 50 Z" fill="currentColor"/>
      <path d="M32 3 C36.5 3 50.5 17.5 55.5 24.5 C57.5 27.8 55.5 31 51.5 30.2 L46 29.4 L46 39.5 C46 46.5 41.5 49 32 49 C22.5 49 18 46.5 18 39.5 L18 29.4 L12.5 30.2 C8.5 31 6.5 27.8 8.5 24.5 C13.5 17.5 27.5 3 32 3 Z" fill="currentColor"/></g>
      <ellipse cx="26" cy="36" rx="5" ry="6" fill="#fff" stroke="${K}" stroke-width="3.6"/><ellipse cx="38" cy="36" rx="5" ry="6" fill="#fff" stroke="${K}" stroke-width="3.6"/>
      <ellipse cx="27" cy="37" rx="2.4" ry="3.2" fill="${K}"/><ellipse cx="37" cy="37" rx="2.4" ry="3.2" fill="${K}"/></g>
    <path d="M12 24 Q16 13 27 9.5" stroke="#fff" stroke-opacity=".85" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    <circle cx="48.5" cy="46" r="2.4" fill="#fff" fill-opacity=".8"/>`),
  // Deep Sonar: sonar screen — range rings, sweep wedge, blips
  sonar: svg(`<circle cx="32" cy="32" r="27" fill="${DK}" stroke="${K}" stroke-width="3"/>
    <g fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="32" cy="32" r="18.5" stroke-opacity=".8"/><circle cx="32" cy="32" r="9.5" stroke-opacity=".8"/><path d="M32 8 L32 56 M8 32 L56 32" stroke-opacity=".35"/></g>
    <path d="M32 32 L32 6.5 A25.5 25.5 0 0 1 54.1 19.2 Z" fill="currentColor" fill-opacity=".45"/>
    <path d="M32 32 L54.1 19.2" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
    <g stroke="${K}" stroke-width="2.4"><circle cx="43.5" cy="18.5" r="4.2" fill="#fff"/><circle cx="19" cy="41" r="3.6" fill="currentColor"/><circle cx="40" cy="46.5" r="3" fill="currentColor"/></g>
    <circle cx="32" cy="32" r="3.2" fill="currentColor" stroke="${K}" stroke-width="2"/>
    <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="2.2" stroke-opacity=".9"/>`),
  // Vortex Strike: missile diving onto an ink swirl
  strike: svg(`<g ${O}><ellipse cx="32" cy="51" rx="28" ry="10.5" fill="currentColor"/></g>
    <path d="M9.5 51 A22.5 8 0 0 1 54.5 51 A17 6 0 0 1 20.5 52.5 A11.5 4 0 0 1 43.5 52.5 A6 2.2 0 0 1 31.5 53" fill="none" stroke="${K}" stroke-width="2.8" stroke-linecap="round"/>
    <g transform="rotate(28 34 22)"><g ${O}>
      <path d="M34 -4 Q39.5 1 37 6 L31 6 Q28.5 1 34 -4 Z" fill="currentColor"/>
      <path d="M27 14 L19 5.5 L19 17 L27 20 Z M41 14 L49 5.5 L49 17 L41 20 Z" fill="${DK}"/>
      <rect x="26.5" y="4.5" width="15" height="25" rx="3" fill="${LT}"/>
      <path d="M26.5 28 L41.5 28 Q42 40 34 45 Q26 40 26.5 28 Z" fill="currentColor"/>
    </g><path d="M27.5 20 L40.5 20" stroke="currentColor" stroke-width="3.2"/><path d="M29.5 8 L29.5 17" stroke="#fff" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round"/></g>
    <path d="M13 45 Q17 42 23 41.5" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  // Twister Zooka: shoulder launcher with a little twister spinning out of the bell
  zooka: svg(`<g fill="none" stroke-linecap="round"><path d="M43 5 L62 5 M45 11 L60 11 M47.5 17 L58 17 M50 22.5 L56 22.5" stroke="${K}" stroke-width="6.5"/>
      <path d="M43 5 L62 5 M45 11 L60 11 M47.5 17 L58 17 M50 22.5 L56 22.5" stroke="currentColor" stroke-width="3"/></g>
    <g ${O}>
      <rect x="16" y="24.5" width="17" height="8" rx="3.5" fill="currentColor"/>
      <path d="M20 44 L17.5 55 Q17 58 20 58 L24.5 58 Q27 58 27.5 55.5 L29.5 44 Z" fill="${DK}"/>
      <rect x="34" y="42" width="5" height="10" rx="2" fill="${DK}"/>
      <path d="M3 30 L8 32 L44 32 L44 44 L8 44 L3 46 Z" fill="${LT}"/>
      <path d="M43 32 L52 25.5 Q54.5 24.5 54.5 27 L54.5 49 Q54.5 51.5 52 50.5 L43 44 Z" fill="${LT}"/>
      <rect x="52.5" y="23.5" width="5" height="29" rx="2.4" fill="currentColor"/>
    </g>
    <path d="M36 32 L36 44 M39 32 L39 44" stroke="${K}" stroke-width="2"/>
    <path d="M10 36 L36 36" stroke="#fff" stroke-opacity=".6" stroke-width="2.8" stroke-linecap="round"/>`),
  // Howl Box: boombox speaker blasting sound waves
  wail: svg(`<g fill="none" stroke-linecap="round"><path d="M45 29 Q49.5 37 45 45 M51 23 Q57.5 37 51 51 M57 17 Q65.5 37 57 57" stroke="${K}" stroke-width="7"/>
      <path d="M45 29 Q49.5 37 45 45 M51 23 Q57.5 37 51 51 M57 17 Q65.5 37 57 57" stroke="currentColor" stroke-width="3.2"/></g>
    <g ${O}>
      <path d="M14 13 L14 8.5 Q14 6 16.5 6 L27.5 6 Q30 6 30 8.5 L30 13" fill="none"/>
      <rect x="3" y="12" width="38" height="44" rx="6" fill="${LT}"/>
      <rect x="6.5" y="23" width="31" height="30" rx="4" fill="${DK}"/>
      <circle cx="22" cy="38" r="11.5" fill="${LT}"/>
      <circle cx="22" cy="38" r="8.5" fill="${DK}"/>
      <circle cx="22" cy="38" r="4" fill="currentColor"/>
    </g>
    <g fill="currentColor"><rect x="15" y="16" width="3" height="4" rx="1"/><rect x="19.5" y="15" width="3" height="5" rx="1"/><rect x="24" y="14" width="3" height="6" rx="1"/></g>
    <circle cx="9.5" cy="17.5" r="2.4" fill="${DK}"/><circle cx="34.5" cy="17.5" r="2.4" fill="${DK}"/>
    <path d="M20.5 35 Q21 34 22.5 33.8" stroke="#fff" stroke-opacity=".8" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
  // Kraken: big squid face — arrowhead fins, goggle mask with huge eyes, tentacle skirt
  kraken: svg(`<g ${O}>
      <path d="M15 49 Q9 56 11 61 Q16 63 21 53 Z M24 52 Q21 59 24 62.5 Q29 63 30 54 Z M40 52 Q43 59 40 62.5 Q35 63 34 54 Z M49 49 Q55 56 53 61 Q48 63 43 53 Z" fill="currentColor"/>
      <path d="M32 2.5 C35.5 2.5 45 12 51 19 L60 25.5 Q62.5 29 58.5 30 L53.5 30.5 Q56 35.5 56 41 C56 51 46.5 56 32 56 C17.5 56 8 51 8 41 Q8 35.5 10.5 30.5 L5.5 30 Q1.5 29 4 25.5 L13 19 C19 12 28.5 2.5 32 2.5 Z" fill="currentColor"/>
      <path d="M9.5 38 Q9 29.5 19.5 28.5 Q27 28 32 32.5 Q37 28 44.5 28.5 Q55 29.5 54.5 38 Q54 46.5 44 46 Q37.5 45.5 32 42.5 Q26.5 45.5 20 46 Q10 46.5 9.5 38 Z" fill="${K}"/>
    </g>
    <ellipse cx="20.5" cy="37.5" rx="6.5" ry="7" fill="#fff"/><ellipse cx="43.5" cy="37.5" rx="6.5" ry="7" fill="#fff"/>
    <ellipse cx="22.5" cy="38.5" rx="3.3" ry="4.2" fill="${K}"/><ellipse cx="41.5" cy="38.5" rx="3.3" ry="4.2" fill="${K}"/>
    <circle cx="23.8" cy="36.6" r="1.3" fill="#fff"/><circle cx="42.8" cy="36.6" r="1.3" fill="#fff"/>
    <path d="M25 11.5 Q29 7 32 6.8" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  // Bubble Blower: bubble wand (soapy ring on a handle) with bubbles floating off
  blower: svg(`<g stroke-linecap="round"><path d="M13 47 L4.5 59.5" stroke="${K}" stroke-width="10"/><path d="M13 47 L4.5 59.5" stroke="${DK}" stroke-width="4.5"/></g>
    <circle cx="20" cy="36" r="12" fill="currentColor" fill-opacity=".3" stroke="${K}" stroke-width="9"/>
    <circle cx="20" cy="36" r="12" fill="none" stroke="${LT}" stroke-width="4"/>
    <circle cx="20" cy="36" r="9.6" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <g stroke="${K}" stroke-width="2.6"><circle cx="43" cy="21" r="11.5" fill="currentColor" fill-opacity=".3"/><circle cx="54" cy="43" r="6.5" fill="currentColor" fill-opacity=".3"/><circle cx="39" cy="47" r="4" fill="currentColor" fill-opacity=".3"/><circle cx="56" cy="8" r="3.4" fill="currentColor" fill-opacity=".3"/></g>
    <g fill="none" stroke="currentColor" stroke-width="2"><circle cx="43" cy="21" r="9.2"/><circle cx="54" cy="43" r="4.6"/></g>
    <g fill="none" stroke="#fff" stroke-linecap="round" stroke-width="2.6"><path d="M36.5 16 Q38.5 12.5 42 12"/><path d="M50.5 40 Q51.5 38.5 53 38.2"/></g>
    <path d="M13 31 Q14.5 28 17.5 27.2" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),
  // Ink Jet: jetpack from behind — ink tank between two thrusters blasting ink flames
  jetpack: svg(`<g ${O}>
      <path d="M11 48 Q6 55 15 63 Q24 55 19 48 Z M45 48 Q40 55 49 63 Q58 55 53 48 Z" fill="currentColor"/>
    </g>
    <path d="M13.5 49 Q12 54 15 58 Q18 54 16.5 49 Z M47.5 49 Q46 54 49 58 Q52 54 50.5 49 Z" fill="#fff" fill-opacity=".85"/>
    <g ${O}>
      <rect x="23" y="7" width="18" height="38" rx="6" fill="${LT}"/>
      <rect x="7.5" y="11" width="15" height="32" rx="7.5" fill="${LT}"/>
      <rect x="41.5" y="11" width="15" height="32" rx="7.5" fill="${LT}"/>
      <path d="M9.5 42 L20.5 42 L22.5 49 L7.5 49 Z M43.5 42 L54.5 42 L56.5 49 L41.5 49 Z" fill="${DK}"/>
      <rect x="27.5" y="13" width="9" height="26" rx="4.5" fill="currentColor"/>
    </g>
    <path d="M8.5 22 L21.5 22 M8.5 29 L21.5 29 M42.5 22 L55.5 22 M42.5 29 L55.5 29" stroke="currentColor" stroke-width="2.8"/>
    <path d="M30.5 17 L30.5 27" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round"/>`),
  // Mega Stamp: a huge rubber stamp slamming down with impact lines
  stamp: svg(`<g stroke-linecap="round"><path d="M3 50 L8 53 M61 50 L56 53 M4 60 L10 59.5 M60 60 L54 59.5" stroke="${K}" stroke-width="6"/><path d="M3 50 L8 53 M61 50 L56 53 M4 60 L10 59.5 M60 60 L54 59.5" stroke="currentColor" stroke-width="2.6"/></g>
    <g ${O}>
      <circle cx="32" cy="10" r="7.5" fill="${LT}"/>
      <rect x="28" y="15" width="8" height="13" rx="2" fill="${DK}"/>
      <rect x="9" y="27" width="46" height="19" rx="4.5" fill="${LT}"/>
      <rect x="7" y="45" width="50" height="10" rx="3" fill="currentColor"/>
    </g>
    <path d="M11 37 L53 37" stroke="${DK}" stroke-width="3"/>
    <path d="M13 32 L28 32" stroke="#fff" stroke-opacity=".7" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="29.5" cy="7.5" r="2" fill="#fff"/>`),
  // Cheer Orb: a glowing orb with a "!" held up in two little hands, burst rays and sparkles
  booyah: svg(`<g stroke-linecap="round">${[-150, -120, -90, -60, -30].map((a) => { const c = Math.cos(a * Math.PI / 180), sn = Math.sin(a * Math.PI / 180); return `<path d="M${(32 + c * 22).toFixed(1)} ${(28 + sn * 22).toFixed(1)} L${(32 + c * 28.5).toFixed(1)} ${(28 + sn * 28.5).toFixed(1)}" stroke="${K}" stroke-width="6.5"/><path d="M${(32 + c * 22).toFixed(1)} ${(28 + sn * 22).toFixed(1)} L${(32 + c * 28.5).toFixed(1)} ${(28 + sn * 28.5).toFixed(1)}" stroke="currentColor" stroke-width="2.8"/>`; }).join('')}</g>
    <circle cx="32" cy="30" r="19.5" fill="currentColor" fill-opacity=".22"/>
    <g stroke-linecap="round"><path d="M6 63 L16.5 46 M58 63 L47.5 46" stroke="${K}" stroke-width="10"/><path d="M6 63 L16.5 46 M58 63 L47.5 46" stroke="${LT}" stroke-width="4.6"/></g>
    <g ${O}>
      <circle cx="32" cy="30" r="15.5" fill="currentColor"/>
      <path d="M13.5 41 Q12 33.5 18 33 Q22.5 33 23.5 38 L24.5 45 Q24 50.5 19 50.5 Q14.5 50 13.5 41 Z" fill="${LT}"/>
      <path d="M50.5 41 Q52 33.5 46 33 Q41.5 33 40.5 38 L39.5 45 Q40 50.5 45 50.5 Q49.5 50 50.5 41 Z" fill="${LT}"/>
    </g>
    <path d="M32 20.5 L32 31.5" stroke="#fff" stroke-width="4.8" stroke-linecap="round"/><circle cx="32" cy="38.2" r="2.8" fill="#fff"/>
    <path d="M22.5 24 Q24 19.5 28.5 18" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    ${[[8, 10, 0.9], [57, 12, 0.75], [58, 44, 0.55], [6, 44, 0.55]].map(([x, y, sc]) => `<path transform="translate(${x} ${y}) scale(${sc})" d="M0 -7 Q1.2 -1.2 7 0 Q1.2 1.2 0 7 Q-1.2 1.2 -7 0 Q-1.2 -1.2 0 -7 Z" fill="#fff" stroke="${K}" stroke-width="${(2.2 / sc).toFixed(2)}" stroke-linejoin="round"/>`).join('')}`),
  // Zipline: grapple hook flying up on its line
  zipcaster: svg(`<path d="M5 60 L35 27" stroke="${K}" stroke-width="8" stroke-linecap="round"/>
    <path d="M5 60 L35 27" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M9 47.5 L14.5 41.5 M18.5 56.5 L24 50.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-opacity=".7"/>
    <g transform="rotate(42 42 22)">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M42 21 Q28 21 27 9 Q27 5 30.5 6 M42 21 Q56 21 57 9 Q57 5 53.5 6 M42 23 L42 2" stroke="${K}" stroke-width="9"/>
        <path d="M42 21 Q28 21 27 9 Q27 5 30.5 6 M42 21 Q56 21 57 9 Q57 5 53.5 6 M42 23 L42 2" stroke="${LT}" stroke-width="3.8"/></g>
      <g ${O}><rect x="38" y="15" width="8" height="21" rx="3" fill="${DK}"/><circle cx="42" cy="38.5" r="4" fill="currentColor"/></g>
      <path d="M39 3 L42 -3 L45 3 Z" fill="${LT}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M39 21 L45 21" stroke="currentColor" stroke-width="2.6"/>
    </g>`),
  // Crab Rig: crab tank head-on — armoured dome with a team stripe, raised claws, eye stalks, stubby legs
  crab: svg(`<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17 46 L9 51 L8 60 M23 49 L19 55 L19 61 M47 46 L55 51 L56 60 M41 49 L45 55 L45 61 M16 38 L9 30 M48 38 L55 30" stroke="${K}" stroke-width="7.5"/>
      <path d="M17 46 L9 51 L8 60 M23 49 L19 55 L19 61 M47 46 L55 51 L56 60 M41 49 L45 55 L45 61 M16 38 L9 30 M48 38 L55 30" stroke="${LT}" stroke-width="3.2"/>
      <path d="M26 27 L24.5 17 M38 27 L39.5 17" stroke="${K}" stroke-width="6"/><path d="M26 27 L24.5 17 M38 27 L39.5 17" stroke="${LT}" stroke-width="2.4"/></g>
    <g ${O}>
      <path d="M3.5 22 Q1.5 10 9 5 Q14 2.5 16 6.5 L11.5 12 Q17 12.5 17.5 18 Q16 27 8.5 27 Q4.5 27 3.5 22 Z" fill="currentColor"/>
      <path d="M60.5 22 Q62.5 10 55 5 Q50 2.5 48 6.5 L52.5 12 Q47 12.5 46.5 18 Q48 27 55.5 27 Q59.5 27 60.5 22 Z" fill="currentColor"/>
      <path d="M8 46 Q8 26 32 25 Q56 26 56 46 Q56 51 48 51 L16 51 Q8 51 8 46 Z" fill="${LT}"/>
      <rect x="24" y="21" width="16" height="6.5" rx="3" fill="${DK}"/>
      <circle cx="24" cy="15" r="4.6" fill="#fff"/><circle cx="40" cy="15" r="4.6" fill="#fff"/>
      <rect x="27" y="41" width="10" height="9" rx="2.5" fill="${DK}"/>
    </g>
    <circle cx="24.8" cy="15.6" r="2" fill="${K}"/><circle cx="39.2" cy="15.6" r="2" fill="${K}"/>
    <path d="M11 38 Q32 30 53 38" stroke="currentColor" stroke-width="4.2" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="45.5" r="2" fill="${LT}"/>
    <path d="M14 33 Q17 29 21 28" stroke="#fff" stroke-opacity=".7" stroke-width="2.6" fill="none" stroke-linecap="round"/>`),
};

// ------------------------------------------------------------------ squid (team icons, avatar)
export const SQUID = svg(`<g ${O} stroke-width="3.4">
    <path d="M22 44 Q19 53 13 58 Q20 61 26 50 Z" fill="currentColor"/>
    <path d="M29 46 Q28.5 55 25 61 Q32.5 61 33 48 Z" fill="currentColor"/>
    <path d="M35 46 Q35.5 55 39 61 Q31.5 61 31 48 Z" fill="currentColor"/>
    <path d="M42 44 Q45 53 51 58 Q44 61 38 50 Z" fill="currentColor"/>
    <path d="M32 3 C36.5 3 50.5 17.5 55.5 24.5 C57.5 27.8 55.5 31 51.5 30.2 L46 29.4 L46 39.5 C46 46.5 41.5 49 32 49 C22.5 49 18 46.5 18 39.5 L18 29.4 L12.5 30.2 C8.5 31 6.5 27.8 8.5 24.5 C13.5 17.5 27.5 3 32 3 Z" fill="currentColor"/>
  </g>
  <path d="M25 13 Q29 8.5 32 8" stroke="#fff" stroke-opacity=".55" stroke-width="3" fill="none" stroke-linecap="round"/>
  <g class="iw-squid-eyes">
    <ellipse cx="26" cy="36" rx="4.6" ry="5.6" fill="#fff" stroke="${K}" stroke-width="2.4"/>
    <ellipse cx="38" cy="36" rx="4.6" ry="5.6" fill="#fff" stroke="${K}" stroke-width="2.4"/>
    <ellipse cx="27" cy="37" rx="2.2" ry="3" fill="${K}"/>
    <ellipse cx="37" cy="37" rx="2.2" ry="3" fill="${K}"/>
  </g>`, '0 0 64 64', 'iw-squid');

// ------------------------------------------------------------------ line glyphs (single colour, currentColor)
const G = `fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
function gearPath() {
  const pts = []; const n = 8;
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = (i % 4 === 0 || i % 4 === 1) ? 27 : 20;
    pts.push(`${(32 + Math.cos(a) * r).toFixed(1)} ${(32 + Math.sin(a) * r).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}
/** Squid silhouette (64 box): pointed mantle, fins, four tentacles. Shared by GLYPHS.squidlet and the splashtag art. */
export const SQUID_PATH = 'M32 3 C40 10 49 19 50 29 L44 31.5 L44 41 C44 44.5 42 46.5 39.5 46.5 L39.5 58 L35.5 53 L32 60 L28.5 53 L24.5 58 L24.5 46.5 C22 46.5 20 44.5 20 41 L20 31.5 L14 29 C15 19 24 10 32 3 Z';
/** The same squid without the tentacle zigzag — the body GLYPHS.squidletSwim draws tentacles under separately
 *  (one path each, so CSS can swim them) and so the body outline stays closed. */
export const SQUID_BODY_PATH = 'M32 3 C40 10 49 19 50 29 L44 31.5 L44 41 C44 44.5 42 46.5 39.5 46.5 L24.5 46.5 C22 46.5 20 44.5 20 41 L20 31.5 L14 29 C15 19 24 10 32 3 Z';
export const GLYPHS = {
  play: svg(`<path d="M21 12 L51 32 L21 52 Z" fill="currentColor" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>`),
  gear: svg(`<path d="${gearPath()}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="32" r="8.5" fill="var(--k, #15121c)"/>`),
  question: svg(`<circle cx="32" cy="32" r="26" fill="currentColor"/><path d="M24 25 Q24 16 32.5 16 Q41 16 41 24 Q41 29.5 35 32 Q32.5 33.3 32.5 37.5" fill="none" stroke="var(--k, #15121c)" stroke-width="6" stroke-linecap="round"/><circle cx="32.5" cy="47" r="3.8" fill="var(--k, #15121c)"/>`),
  star: svg(`<path d="M32 5 L39.5 23 L58.5 24.5 L44 37 L48.5 56 L32 46 L15.5 56 L20 37 L5.5 24.5 L24.5 23 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`),
  back: svg(`<path d="M38 14 L20 32 L38 50" ${G} stroke-width="8"/>`),
  next: svg(`<path d="M26 14 L44 32 L26 50" ${G} stroke-width="8"/>`),
  check: svg(`<path d="M14 33 L27 46 L51 18" ${G} stroke-width="8"/>`),
  close: svg(`<path d="M18 18 L46 46 M46 18 L18 46" ${G} stroke-width="8"/>`),
  crown: svg(`<path d="M8 22 L20 34 L32 12 L44 34 L56 22 L51 50 L13 50 Z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>`),
  clock: svg(`<circle cx="32" cy="33" r="23" ${G}/><path d="M32 20 L32 34 L41 40" ${G}/>`),
  pencil: svg(`<path d="M14 50 L17 38 L42 13 L51 22 L26 47 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M36 19 L45 28" stroke="var(--k, #15121c)" stroke-width="3.5"/>`),
  map: svg(`<path d="M8 16 L24 10 L40 16 L56 10 L56 48 L40 54 L24 48 L8 54 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 10 L24 48 M40 16 L40 54" stroke="var(--k, #15121c)" stroke-width="3.5"/>`),
  bot: svg(`<rect x="12" y="18" width="40" height="32" rx="10" fill="currentColor"/><path d="M32 18 L32 9" ${G} stroke-width="4.5"/><circle cx="32" cy="8" r="4" fill="currentColor"/><circle cx="24" cy="34" r="4.5" fill="var(--k, #15121c)"/><circle cx="40" cy="34" r="4.5" fill="var(--k, #15121c)"/>`),
  gamepad: svg(`<path d="M18 17 L46 17 Q58 17 60 34 Q62 50 54 50 Q49 50 44 42 L20 42 Q15 50 10 50 Q2 50 4 34 Q6 17 18 17 Z" fill="currentColor"/><path d="M19 25 L19 35 M14 30 L24 30" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/><circle cx="44" cy="27" r="3.2" fill="var(--k, #15121c)"/><circle cx="50" cy="33" r="3.2" fill="var(--k, #15121c)"/>`),
  keyboard: svg(`<rect x="4" y="16" width="56" height="34" rx="7" fill="currentColor"/><g fill="var(--k, #15121c)"><rect x="11" y="23" width="6" height="6" rx="1.5"/><rect x="20" y="23" width="6" height="6" rx="1.5"/><rect x="29" y="23" width="6" height="6" rx="1.5"/><rect x="38" y="23" width="6" height="6" rx="1.5"/><rect x="47" y="23" width="6" height="6" rx="1.5"/><rect x="11" y="32" width="6" height="6" rx="1.5"/><rect x="47" y="32" width="6" height="6" rx="1.5"/><rect x="20" y="40" width="24" height="5" rx="2"/></g>`),
  monitor: svg(`<rect x="6" y="10" width="52" height="34" rx="6" fill="currentColor"/><path d="M24 54 L40 54 M32 44 L32 54" ${G} stroke-width="5"/><path d="M14 36 L24 24 L31 31 L38 22 L50 36" fill="none" stroke="var(--k, #15121c)" stroke-width="4" stroke-linejoin="round"/>`),
  speaker: svg(`<path d="M8 24 L20 24 L34 12 L34 52 L20 40 L8 40 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M42 23 Q48 32 42 41 M48 16 Q59 32 48 48" ${G} stroke-width="5"/>`),
  flag: svg(`<path d="M14 58 L14 8" ${G} stroke-width="6"/><path d="M14 10 Q24 4 34 10 Q44 16 54 10 L54 34 Q44 40 34 34 Q24 28 14 34 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`),
  reset: svg(`<path d="M50 30 A18 18 0 1 1 42 17" ${G} stroke-width="6.5"/><path d="M40 7 L45 19 L33 22" ${G} stroke-width="6.5"/>`),
  sun: svg(`<circle cx="32" cy="32" r="12" fill="currentColor"/><g ${G} stroke-width="5">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<path d="M${(32 + Math.cos(a) * 19).toFixed(1)} ${(32 + Math.sin(a) * 19).toFixed(1)} L${(32 + Math.cos(a) * 26).toFixed(1)} ${(32 + Math.sin(a) * 26).toFixed(1)}"/>`; }).join('')}</g>`),
  moon: svg(`<path d="M40 8 A24 24 0 1 0 56 40 A19 19 0 0 1 40 8 Z" fill="currentColor"/>`),
  users: svg(`<circle cx="22" cy="22" r="9" fill="currentColor"/><circle cx="43" cy="22" r="9" fill="currentColor"/><path d="M6 52 Q6 36 22 36 Q38 36 38 52 Z M30 52 Q30 36 43 36 Q58 36 58 52 Z" fill="currentColor"/>`),
  drop: svg(`<path d="M32 6 C32 6 50 28 50 40 C50 51 42 58 32 58 C22 58 14 51 14 40 C14 28 32 6 32 6 Z" fill="currentColor"/>`),
  swords: svg(`<path d="M12 10 L40 38 M52 10 L24 38" ${G} stroke-width="6"/><path d="M34 44 L44 34 M20 34 L30 44 M42 42 L54 54 M22 42 L10 54" ${G} stroke-width="6"/>`),
  hanger: svg(`<path d="M26 16 Q26 8.5 32 8.5 Q38 8.5 38 14.5 Q38 19.5 32 21.5 L32 26" ${G} stroke-width="5"/><path d="M32 25 L7 42.5 Q3.5 45.5 8.5 48 L55.5 48 Q60.5 45.5 57 42.5 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M16 43 L48 43" stroke="var(--k, #15121c)" stroke-width="3" stroke-linecap="round" opacity=".45"/>`),
  dice: svg(`<rect x="8" y="8" width="48" height="48" rx="12" fill="currentColor" transform="rotate(-8 32 32)"/><g fill="var(--k, #15121c)" transform="rotate(-8 32 32)"><circle cx="21" cy="21" r="4.6"/><circle cx="43" cy="21" r="4.6"/><circle cx="32" cy="32" r="4.6"/><circle cx="21" cy="43" r="4.6"/><circle cx="43" cy="43" r="4.6"/></g>`),
  shirt: svg(`<path d="M23 9 L12 13 L3.5 26 L13 32.5 L17 27.5 L17 56 L47 56 L47 27.5 L51 32.5 L60.5 26 L52 13 L41 9 Q38 16.5 32 16.5 Q26 16.5 23 9 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M17 36 L47 36" stroke="var(--k, #15121c)" stroke-width="4" opacity=".4"/>`),
  eye: svg(`<path d="M4 32 Q32 5 60 32 Q32 59 4 32 Z" fill="currentColor"/><circle cx="32" cy="32" r="12" fill="var(--k, #15121c)"/><circle cx="36.5" cy="27.5" r="4" fill="currentColor"/>`),
  hair: svg(`<path d="M12 36 Q10 11 32 9 Q54 11 52 36 Q47 30 43 34 Q40 26 32 29 Q24 26 21 34 Q17 30 12 36 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M13 34 Q8 46 12 58 Q19 52 20 39 Z M44 39 Q45 52 52 58 Q56 46 51 34 Z M27 34 Q25 47 28 56 Q34 49 33 35 Z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 20 Q24 15 30 14" stroke="var(--k, #15121c)" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".35"/>`),
  palette: svg(`<path d="M32 6 C16 6 6 18 6 32 C6 46.5 18 58 32 58 C38.5 58 40.5 54 38.5 50 C36.5 46 38.5 42 44 42 L50 42 C56 42 58 36.5 58 32 C58 18 48 6 32 6 Z" fill="currentColor"/><g fill="var(--k, #15121c)"><circle cx="19" cy="31" r="4.6"/><circle cx="25" cy="19" r="4.6"/><circle cx="38.5" cy="16.5" r="4.6"/><circle cx="48" cy="26" r="4.6"/></g>`),
  sparkle: svg(`<path d="M32 4 Q35 26 60 32 Q35 38 32 60 Q29 38 4 32 Q29 26 32 4 Z" fill="currentColor"/>`),
  rotate: svg(`<path d="M50 23 A20 20 0 0 0 14 25" ${G} stroke-width="5.5"/><path d="M14 41 A20 20 0 0 0 50 39" ${G} stroke-width="5.5"/><path d="M52 10 L51 24 L37 22" ${G} stroke-width="5.5"/><path d="M12 54 L13 40 L27 42" ${G} stroke-width="5.5"/>`),
  bolt: svg(`<path d="M36 4 L12 36 L30 36 L26 60 L52 26 L34 26 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>`),
  target: svg(`<circle cx="32" cy="32" r="22" ${G} stroke-width="5"/><circle cx="32" cy="32" r="10" ${G} stroke-width="5"/><path d="M32 2 L32 14 M32 50 L32 62 M2 32 L14 32 M50 32 L62 32" ${G} stroke-width="5"/>`),
  feather: svg(`<path d="M52 8 Q22 12 16 40 L12 54 L17 50 Q46 44 52 8 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M14 52 L40 22" stroke="var(--k, #15121c)" stroke-width="3" stroke-linecap="round" opacity=".45"/>`),
  // online / lobby
  online: svg(`<path d="M32 30 C38 30 42 34 42 40 C42 46 38 50 32 50 C26 50 22 46 22 40 C22 34 26 30 32 30 Z" fill="currentColor"/><path d="M26 49 L22 58 M32 50 L32 59 M38 49 L42 58" ${G} stroke-width="4.5"/><path d="M17 26 Q32 12 47 26" ${G} stroke-width="5"/><path d="M8 17 Q32 -4 56 17" ${G} stroke-width="5" opacity=".6"/><circle cx="28" cy="39" r="2.8" fill="var(--k, #15121c)"/><circle cx="36" cy="39" r="2.8" fill="var(--k, #15121c)"/>`),
  copy: svg(`<rect x="21" y="8" width="33" height="38" rx="7" fill="none" stroke="currentColor" stroke-width="5.5"/><rect x="10" y="18" width="33" height="38" rx="7" fill="currentColor"/><path d="M18 31 L35 31 M18 40 L30 40" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/>`),
  paste: svg(`<rect x="11" y="12" width="42" height="46" rx="8" fill="currentColor"/><rect x="21" y="5" width="22" height="13" rx="5" fill="currentColor" stroke="var(--k, #15121c)" stroke-width="3.5"/><path d="M21 31 L43 31 M21 40 L43 40 M21 49 L34 49" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/>`),
  exit: svg(`<path d="M30 10 L14 10 Q10 10 10 14 L10 50 Q10 54 14 54 L30 54" ${G} stroke-width="6"/><path d="M26 32 L54 32 M44 21 L55 32 L44 43" ${G} stroke-width="6.5"/>`),
  lock: svg(`<rect x="12" y="28" width="40" height="30" rx="7" fill="currentColor"/><path d="M20 29 L20 21 Q20 9 32 9 Q44 9 44 21 L44 29" ${G} stroke-width="6"/><circle cx="32" cy="41" r="4.5" fill="var(--k, #15121c)"/><path d="M32 43 L32 50" stroke="var(--k, #15121c)" stroke-width="4" stroke-linecap="round"/>`),
  plus: svg(`<path d="M32 12 L32 52 M12 32 L52 32" ${G} stroke-width="8.5"/>`),
  key: svg(`<circle cx="21" cy="32" r="13" fill="currentColor"/><circle cx="18" cy="32" r="4.5" fill="var(--k, #15121c)"/><path d="M33 32 L57 32 M48 32 L48 42 M56 32 L56 40" ${G} stroke-width="6"/>`),
  smile: svg(`<circle cx="32" cy="32" r="26" fill="currentColor"/><circle cx="23.5" cy="27" r="4" fill="var(--k, #15121c)"/><circle cx="40.5" cy="27" r="4" fill="var(--k, #15121c)"/><path d="M20 38 Q32 50 44 38" fill="none" stroke="var(--k, #15121c)" stroke-width="4.5" stroke-linecap="round"/>`),
  booyah: svg(`<path d="M10 26 L28 22 L48 9 L48 55 L28 42 L10 38 Z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M18 40 L22 55 L30 55 L27 42" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M54 24 L60 20 M55 32 L62 32 M54 40 L60 44" ${G} stroke-width="4"/>`),
  hand: svg(`<path d="M22 56 Q12 50 11 38 L10 30 Q10 26 13.5 26 Q17 26 17.5 30 L18 36 L18 13 Q18 9 21.5 9 Q25 9 25 13 L25 30 L25 8 Q25 4 28.5 4 Q32 4 32 8 L32 30 L32 11 Q32 7 35.5 7 Q39 7 39 11 L39 31 L39 17 Q39 13 42.5 13 Q46 13 46 17 L46 40 Q46 54 36 57 Z" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M50 8 Q57 12 58 20 M53 3 Q62 8 63 17" ${G} stroke-width="3.5" opacity=".8"/>`),
  note: svg(`<path d="M24 46 L24 12 L52 6 L52 40" ${G} stroke-width="6"/><ellipse cx="17" cy="47" rx="9" ry="7" fill="currentColor" transform="rotate(-18 17 47)"/><ellipse cx="45" cy="41" rx="9" ry="7" fill="currentColor" transform="rotate(-18 45 41)"/><path d="M24 21 L52 15" ${G} stroke-width="6"/>`),
  flex: svg(`<path d="M14 54 Q8 40 16 30 L24 20 Q22 14 26 10 Q32 6 37 10 L40 14 Q36 18 33 18 L30 24 Q38 22 46 26 Q56 32 54 44 Q52 54 40 56 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M30 36 Q38 32 46 38" fill="none" stroke="var(--k, #15121c)" stroke-width="3.5" stroke-linecap="round" opacity=".45"/>`),
  signal: svg(`<rect x="8" y="40" width="10" height="16" rx="3" fill="currentColor"/><rect x="27" y="28" width="10" height="28" rx="3" fill="currentColor"/><rect x="46" y="12" width="10" height="44" rx="3" fill="currentColor"/>`),
  // squid silhouette (lobby head-count pips, splashtag patterns): outlined in ink, eyes cut out
  squidlet: svg(`<path d="${SQUID_PATH}" fill="currentColor" stroke="var(--k, #15121c)" stroke-width="4" stroke-linejoin="round"/><circle cx="26.5" cy="36" r="3.4" fill="var(--k, #15121c)"/><circle cx="37.5" cy="36" r="3.4" fill="var(--k, #15121c)"/>`),
  // squid with four individually animated tentacles (the loading bar's Inkling and the corner spinner): the body is
  // one closed path, each tentacle its own <path class="iw-tent iw-tent--n"> so the swim wave is pure CSS.
  squidletSwim: svg(`<g class="iw-tents">${[['M24 44 Q21 51 24.5 58'], ['M28.6 45 Q26.6 52 28.5 53'], ['M35.4 45 Q37.4 52 35.5 53'], ['M40 44 Q43 51 39.5 58']]
    .map((d, i) => `<path class="iw-tent iw-tent--${i}" d="${d}" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>`).join('')}</g>` +
    `<path d="${SQUID_BODY_PATH}" fill="currentColor" stroke="var(--k, #15121c)" stroke-width="4" stroke-linejoin="round"/><circle cx="26.5" cy="36" r="3.4" fill="var(--k, #15121c)"/><circle cx="37.5" cy="36" r="3.4" fill="var(--k, #15121c)"/>`),
};

/** Kill-feed / stat glyphs */
export const SPLAT_ICON = (() => {
  const s = splatShape(32, 32, 17, { seed: 11, arms: 8, drops: 4, armLen: 0.5 });
  return svg(`<path d="${s.core}" fill="currentColor" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>${s.drops.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${Math.max(2.2, d.r)}" fill="currentColor" stroke="${K}" stroke-width="2"/>`).join('')}`);
})();
export const DEATH_ICON = svg(`<g ${O} stroke-width="3.4">
    <path d="M32 6 C36.5 6 50 19 54.5 25.5 C56.5 28.5 54.5 31.5 50.5 30.7 L46 30 L46 40 C46 47 41.5 50 32 50 C22.5 50 18 47 18 40 L18 30 L13.5 30.7 C9.5 31.5 7.5 28.5 9.5 25.5 C14 19 27.5 6 32 6 Z" fill="currentColor"/>
  </g>
  <path d="M21.5 31.5 L29 39 M29 31.5 L21.5 39 M35 31.5 L42.5 39 M42.5 31.5 L35 39" stroke="${K}" stroke-width="3.6" stroke-linecap="round"/>`);

// ------------------------------------------------------------------ input glyphs
const PAD_FACE = { A: '#3fc46e', B: '#ff4f5a', X: '#3c8cff', Y: '#ffc31d' };
/** Keycap. `k` is the label ('W', 'SHIFT', 'SPACE', ...). */
export function keycap(k) {
  const s = String(k);
  const wide = s.length > 2 ? ' iw-key--wide' : '';
  return `<kbd class="iw-key${wide}">${esc(s === ' ' ? 'SPACE' : s)}</kbd>`;
}
/** Mouse glyph: which = 'L' | 'R' | 'M' (move) | 'W' (wheel) */
export function mouseGlyph(which = 'L') {
  const l = which === 'L' ? 'var(--a, #ff8a14)' : '#fff';
  const r = which === 'R' ? 'var(--a, #ff8a14)' : '#fff';
  const arrows = which === 'M' ? `<g stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 32 L-3 32 M0 29 L-3 32 L0 35"/><path d="M45 32 L51 32 M48 29 L51 32 L48 35"/></g>` : '';
  return `<span class="iw-mouse"><svg viewBox="-6 0 60 64" aria-hidden="true">${arrows}
    <path d="M24 6 Q40 6 40 24 L40 42 Q40 58 24 58 Q8 58 8 42 L8 24 Q8 6 24 6 Z" fill="#fff" stroke="${K}" stroke-width="3"/>
    <path d="M24 6 Q9.5 6 8.3 24 L24 24 Z" style="fill:${l}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 6 Q38.5 6 39.7 24 L24 24 Z" style="fill:${r}" stroke="${K}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="21.5" y="11" width="5" height="9" rx="2.5" fill="${K}"/></svg></span>`;
}
/** Gamepad glyph: 'A' 'B' 'X' 'Y' 'LB' 'RB' 'LT' 'RT' 'LS' 'RS' 'View' 'Start' 'DPad' */
export function padGlyph(b) {
  if (PAD_FACE[b]) return `<span class="iw-pad iw-pad--face" style="--pc:${PAD_FACE[b]}">${b}</span>`;
  if (b === 'LB' || b === 'RB') return `<span class="iw-pad iw-pad--bumper">${b}</span>`;
  if (b === 'LT' || b === 'RT') return `<span class="iw-pad iw-pad--trigger">${b}</span>`;
  if (b === 'LS' || b === 'RS') return `<span class="iw-pad iw-pad--stick">${b[0]}</span>`;
  if (b === 'View') return `<span class="iw-pad iw-pad--sys"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="9" y="10" width="10" height="8" rx="1.5" fill="currentColor"/></svg></span>`;
  if (b === 'Start') return `<span class="iw-pad iw-pad--sys"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7 H19 M5 12 H19 M5 17 H19" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></span>`;
  if (b === 'DPad') return `<span class="iw-pad iw-pad--sys"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z" fill="currentColor"/></svg></span>`;
  return `<span class="iw-pad iw-pad--bumper">${esc(b)}</span>`;
}
/** Renders "Hold [SHIFT] to swim" → text with keycaps. `{A}` renders a gamepad glyph. */
export function richText(str) {
  return esc(str)
    .replace(/\[([^\]]{1,10})\]/g, (_, k) => (k === 'LMB' ? mouseGlyph('L') : k === 'RMB' ? mouseGlyph('R') : keycap(k)))
    .replace(/\{([A-Za-z]{1,5})\}/g, (_, k) => padGlyph(k));
}

// ------------------------------------------------------------------ logo
/** Big display logo: letters + ink splat + animated drips. size: 'xl' | 'md' | 'sm' */
export function logoMarkup(title = 'INKWAVE', subtitle = 'Turf Riot', size = 'xl') {
  const letters = [...title].map((ch, i) => `<span class="iw-logo__l" style="--i:${i}" data-l="${esc(ch)}">${esc(ch)}</span>`).join('');
  const s = splatShape(300, 110, 88, { seed: 23, arms: 11, drops: 9, armLen: 0.55 });
  // drips hanging off the splat, grow + drop
  const drips = [[190, 150, 1.0], [262, 162, 1.35], [335, 158, 0.8], [402, 150, 1.15]].map(([x, y, k], i) =>
    `<g class="iw-drip" style="--d:${i}"><path class="iw-fa" d="M${x - 7} ${y} L${x + 7} ${y} L${x + 5} ${y + 28 * k} Q${x} ${y + 38 * k} ${x - 5} ${y + 28 * k} Z"/>
     <circle class="iw-fa iw-drip__drop" cx="${x}" cy="${y + 36 * k}" r="5.5"/></g>`).join('');
  return `<div class="iw-logo iw-logo--${size}">
    <svg class="iw-logo__splat" viewBox="0 0 600 240" aria-hidden="true">
      <g transform="translate(300 110) scale(1.7 1.02) translate(-300 -110)">
        <path class="iw-fb" transform="translate(-30 12) rotate(-10 300 110)" d="${s.core}"/>
        <path class="iw-fa" d="${s.core}"/>
      </g>
      ${s.drops.map((d) => `<circle class="iw-fa" cx="${(300 + (d.x - 300) * 1.7).toFixed(1)}" cy="${d.y}" r="${d.r}"/>`).join('')}
      ${drips}
    </svg>
    <div class="iw-logo__word">${letters}</div>
    ${subtitle ? `<div class="iw-logo__sub"><span>${esc(subtitle)}</span></div>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ map thumbnails
/** Stylised top-down illustration of an arena. theme: 'day' | 'sunset' */
export function mapThumb(map, seed = 3) {
  const sunset = map && map.theme === 'sunset';
  const id = 'm' + Math.floor(Math.random() * 1e9).toString(36);
  const sea = sunset ? ['#ffb36b', '#e0607e', '#5b3b9a'] : ['#7fe3f5', '#2fb1e6', '#1e76cf'];
  const deck = sunset ? '#f1cfae' : '#f6efe0';
  const deckEdge = sunset ? '#b98468' : '#c9b99c';
  const block = sunset ? '#e4b894' : '#e9dfcb';
  const blockTop = sunset ? '#f6dcc2' : '#fffaf0';
  const sa = splatShape(0, 0, 1, { seed: seed * 3 + 1, arms: 8, drops: 0 });
  const sb = splatShape(0, 0, 1, { seed: seed * 5 + 2, arms: 9, drops: 0 });
  const splat = (cls, shape, x, y, r, rot) => `<path class="${cls}" transform="translate(${x} ${y}) rotate(${rot}) scale(${r})" d="${shape.core}"/>`;
  const waves = Array.from({ length: 7 }, (_, i) => {
    const y = 14 + i * 29; const x = (i % 2) * 22;
    return `<path d="M${x - 10} ${y} q10 -6 20 0 t20 0 M${x + 250} ${y + 8} q10 -6 20 0 t20 0" stroke="#fff" stroke-opacity="${sunset ? 0.35 : 0.5}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }).join('');
  const lights = sunset ? Array.from({ length: 14 }, (_, i) => `<circle cx="${52 + i * 16.5}" cy="${34 + Math.sin(i * 0.9) * 2}" r="2.6" fill="#fff4b0"/><circle cx="${52 + i * 16.5}" cy="${34 + Math.sin(i * 0.9) * 2}" r="6" fill="#ffe27a" opacity=".35"/>`).join('') : '';
  const sun = sunset
    ? `<circle cx="276" cy="18" r="30" fill="#ffe08a" opacity=".55"/><circle cx="276" cy="18" r="17" fill="#fff1b8"/>`
    : `<circle cx="292" cy="10" r="26" fill="#fff" opacity=".35"/>`;
  return `<svg class="iw-mapthumb" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${id}s" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${sea[0]}"/><stop offset=".55" stop-color="${sea[1]}"/><stop offset="1" stop-color="${sea[2]}"/></linearGradient>
    <clipPath id="${id}c"><rect x="44" y="30" width="232" height="146" rx="16"/></clipPath></defs>
    <rect width="320" height="200" fill="url(#${id}s)"/>${waves}${sun}
    <rect x="48" y="40" width="232" height="146" rx="16" fill="#000" opacity=".18"/>
    <rect x="44" y="30" width="232" height="146" rx="16" fill="${deckEdge}"/>
    <rect x="44" y="30" width="232" height="140" rx="16" fill="${deck}"/>
    <g clip-path="url(#${id}c)">
      <path d="M44 72 H276 M44 128 H276 M102 30 V176 M160 30 V176 M218 30 V176" stroke="${deckEdge}" stroke-opacity=".35" stroke-width="2"/>
      ${splat('iw-fa', sa, 78, 100, 30, 10)}${splat('iw-fa', sb, 118, 62, 17, 40)}${splat('iw-fa', sa, 128, 140, 14, 70)}${splat('iw-fa', sb, 60, 150, 12, 5)}
      ${splat('iw-fb', sb, 244, 102, 29, 25)}${splat('iw-fb', sa, 206, 140, 17, 60)}${splat('iw-fb', sb, 196, 58, 13, 12)}${splat('iw-fb', sa, 262, 54, 11, 80)}
      <g>
        <rect x="140" y="86" width="40" height="30" rx="7" fill="${block}"/><rect x="140" y="82" width="40" height="28" rx="7" fill="${blockTop}"/>
        <rect x="96" y="40" width="30" height="20" rx="6" fill="${block}"/><rect x="96" y="37" width="30" height="18" rx="6" fill="${blockTop}"/>
        <rect x="194" y="150" width="30" height="18" rx="6" fill="${block}"/><rect x="194" y="147" width="30" height="16" rx="6" fill="${blockTop}"/>
        <rect x="100" y="146" width="22" height="22" rx="6" fill="${block}"/><rect x="100" y="143" width="22" height="20" rx="6" fill="${blockTop}"/>
        <rect x="200" y="40" width="22" height="22" rx="6" fill="${block}"/><rect x="200" y="37" width="22" height="20" rx="6" fill="${blockTop}"/>
        <path class="iw-fa" d="M140 99 q8 -4 14 0 v11 h-14 z" opacity=".9"/>
      </g>
    </g>
    <circle cx="58" cy="103" r="11" class="iw-fa" stroke="#fff" stroke-width="4"/>
    <circle cx="262" cy="103" r="11" class="iw-fb" stroke="#fff" stroke-width="4"/>
    ${lights}
  </svg>`;
}

// ------------------------------------------------------------------ how-to illustrations (120 x 80)
export const RULE_ART = {
  turf: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <path d="M10 60 L60 34 L110 60 L60 78 Z" fill="#f4ecdc" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>
    <path class="iw-fa" d="${blobPath(46, 58, 16, { seed: 4, sy: 0.55, points: 10, wobble: 0.22 })}"/>
    <path class="iw-fa" d="${blobPath(64, 47, 9, { seed: 9, sy: 0.55, points: 8, wobble: 0.25 })}"/>
    <path class="iw-fb" d="${blobPath(84, 58, 8, { seed: 5, sy: 0.55, points: 8, wobble: 0.25 })}"/>
    <g transform="translate(18 8)"><rect width="84" height="13" rx="6.5" fill="${K}"/><rect x="3" y="3" width="52" height="7" rx="3.5" class="iw-fa"/><rect x="55" y="3" width="26" height="7" rx="3.5" class="iw-fb"/></g>
    <path d="M60 22 L60 30" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 3"/>
  </svg>`,
  swim: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <path class="iw-fa" d="${blobPath(60, 58, 44, { seed: 12, sy: 0.3, points: 12, wobble: 0.12 })}"/>
    <g transform="translate(40 26) scale(.62)" style="color:var(--a)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>
    <path d="M18 42 L32 42 M12 50 L30 50 M20 58 L34 58" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
    <g transform="translate(88 14)"><rect width="16" height="34" rx="8" fill="#fff" stroke="${K}" stroke-width="2.5"/><rect x="3" y="12" width="10" height="19" rx="5" class="iw-fa"/><path d="M8 -2 L8 8 M4 3 L8 -2 L12 3" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
  </svg>`,
  enemy: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <path class="iw-fb" d="${blobPath(58, 60, 44, { seed: 31, sy: 0.3, points: 11, wobble: 0.14 })}"/>
    <g transform="translate(36 22) scale(.62)" style="color:var(--a)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>
    <path d="M78 16 q4 6 0 9 q-4 -3 0 -9z" fill="#9fe3ff" stroke="${K}" stroke-width="1.8"/>
    <g transform="translate(86 34)"><rect width="26" height="16" rx="8" fill="${K}"/><text x="13" y="12" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="900" font-size="10" fill="#ff5a6a">HP</text></g>
    <path d="M92 58 L100 58 M96 54 L96 62" stroke="#fff" stroke-width="0" />
    <path d="M18 28 l6 6 m0 -6 l-6 6" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  climb: `<svg viewBox="0 0 120 80" aria-hidden="true">
    <path d="M58 6 L102 6 L102 76 L58 76 Z" fill="#e8dcc6" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M58 6 L50 12 L50 80 L58 76 Z" fill="#cdbd9f" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>
    <path class="iw-fa" d="M68 76 L68 20 Q68 12 76 12 Q86 12 86 22 L86 76 Z"/>
    <path class="iw-fa" d="M66 34 q-6 2 -5 8 q4 -2 5 -8z M88 50 q6 2 5 8 q-4 -2 -5 -8z"/>
    <g transform="translate(62 30) scale(.4)" style="color:var(--a-light, #fff)">${SQUID.replace('class="iw-ico iw-squid"', 'x="0" y="0" width="64" height="64"')}</g>
    <path d="M36 62 L36 22 M28 30 L36 20 L44 30" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M36 62 L36 22 M28 30 L36 20 L44 30" stroke="${K}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/>
  </svg>`,
};

// ------------------------------------------------------------------ helpers
export const weaponIcon = (idOrKind) => WEAPON_ICONS[idOrKind] || WEAPON_ICONS.shooter;
// Bomb Barrage variants: three of the sub's own icon falling, under the barrage's motion streaks
{
  const inner = (svgStr) => svgStr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const streaks = `<g stroke-linecap="round"><path d="M12 3 L12 11 M32 2 L32 8 M52 3 L52 11" stroke="${K}" stroke-width="6.5"/><path d="M12 3 L12 11 M32 2 L32 8 M52 3 L52 11" stroke="currentColor" stroke-width="2.8"/></g>`;
  for (const [id, sub] of [['barrage_sticky', 'sticky'], ['barrage_burst', 'burst'], ['barrage_seeker', 'seeker'], ['barrage_mist', 'mist']]) {
    const body = inner(SUB_ICONS[sub] || SUB_ICONS.bomb);
    SPECIAL_ICONS[id] = svg(streaks + [[16.5, 36, 0.44, -14], [47.5, 36, 0.44, 14], [32, 42, 0.56, 0]]
      .map(([x, y, sc, r]) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${sc}) translate(-32 -32)">${body}</g>`).join(''));
  }
}
export const specialIcon = (id) => SPECIAL_ICONS[id] || SPECIAL_ICONS.slam;
