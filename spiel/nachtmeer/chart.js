import { PLACES } from './scenario.js';

export const PORTS = {
  lys: { x: 450, y: 325 },
  werft: { x: 182, y: 428 },
  gaerten: { x: 410, y: 575 },
  aster: { x: 770, y: 188 },
  riff: { x: 802, y: 555 },
};

const COASTS = {
  lys: 'M336 231 351 201 375 210 391 235 418 224 447 237 458 217 481 239 495 267 523 270 538 293 529 319 550 341 538 367 511 373 503 401 479 413 463 401 442 422 418 410 401 382 381 380 365 351 337 339 349 314 329 290 340 266 326 249Z',
  werft: 'M134 344 162 336 170 362 192 368 204 355 225 379 215 400 235 419 226 445 240 458 219 476 208 507 183 490 160 499 145 477 125 469 140 449 118 427 129 402 114 381Z',
  gaerten: 'M345 489 368 475 386 494 412 491 431 470 453 484 451 510 477 522 466 547 483 568 464 596 477 614 451 630 430 652 406 638 388 655 369 634 348 634 340 608 314 594 323 571 310 553 332 533 328 510Z',
  aster: 'M704 93 727 85 741 108 766 110 785 88 804 109 810 130 831 143 827 164 847 179 834 201 848 227 825 242 813 266 788 252 772 276 746 258 718 264 710 239 688 227 696 207 676 187 690 165 682 144 702 123Z',
  riff: 'M770 477 786 465 801 484 824 478 841 499 838 518 856 530 846 553 866 573 841 584 831 607 810 596 791 615 774 596 751 592 757 570 736 548 750 530 746 508Z',
};

const ROUTES = {
  werft: 'M450 325 C360 307 292 330 182 428',
  aster: 'M450 325 C564 241 658 201 770 188',
  gaerten: 'M450 325 C548 427 525 512 410 575',
  riff: 'M450 325 C608 377 709 430 802 555',
};

function coastline(path) {
  const values=path.match(/\d+/g).map(Number);
  const points=Array.from({length:values.length/2},(_,i)=>[values[i*2],values[i*2+1]]);
  const mix=(a,b)=>a.map((n,i)=>n*.76+b[i]*.24);
  const start=mix(points[0],points.at(-1));
  return `M${start.join(' ')} `+points.map((point,i)=>{
    const next=points[(i+1)%points.length];
    return `Q${point.join(' ')} ${mix(point,next).join(' ')} L${mix(next,point).join(' ')}`;
  }).join(' ')+' Z';
}

/** Presentation derives only from committed state and the current draft. */
export function siteState(game, draft, id) {
  const open = game.open.includes(id);
  const lit = game.lit.includes(id);
  const planned = draft.orders.find(order => order.place === id && ['explore', 'beacon'].includes(order.action))?.action ?? null;
  const label = planned === 'explore' ? 'Erkundung vorgemerkt' : planned === 'beacon' ? 'Feuerbau vorgemerkt' : lit ? 'Feuer in Betrieb' : open ? 'Seeweg offen' : 'Seeweg unbekannt';
  return { id, open, lit, planned, label };
}

export function localRules(game, id) {
  const rules = [];
  if (id === 'lys' && game.flags.refugees) rules.push('Offener Hafen · Bedarf +1');
  if (['werft', 'riff'].includes(id) && game.flags.charter) rules.push('Bergung +2 Baustoffe');
  if (['aster', 'gaerten'].includes(id) && game.flags.charter && !game.lit.includes(id)) rules.push('Feuerbau · 3 Baustoffe Reserve');
  if (['aster', 'gaerten', 'riff'].includes(id) && game.flags.commons) rules.push('Gemeingut · reichsweit 1 Ätherauftrag');
  if (id === 'lys' && game.flags.breakwater) rules.push('Kaimauer · Sturmschutz +3');
  return rules;
}

export function chartMarkup(game, draft, selected, mode = 'routes') {
  const sites = Object.keys(PORTS).map(id => siteState(game, draft, id));
  return `<svg class="nautical-chart" viewBox="0 0 1400 800" aria-hidden="true"><g transform="scale(1.4 1)">
    <defs><pattern id="shoal-lines" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7 7 0"/></pattern><pattern id="orchard" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M6 4v5M4 7h4"/></pattern></defs>
    <path class="current-line" d="M16 165C140 133 149 235 231 205S254 108 381 111 528 173 630 91M22 613C163 547 169 662 253 659M528 658C610 592 643 683 696 645S724 703 970 679"/>
    <text class="sea-name" x="102" y="205" transform="rotate(-11 102 205)">Nachtmeer</text>
    <text class="sea-note" x="97" y="231" transform="rotate(-11 97 231)">Gewässer um Lys</text>
    <text class="sea-name small" x="590" y="628" transform="rotate(8 590 628)">Die äußere Küste</text>
    <g class="shoals"><path d="M80 318Q204 278 270 381T233 541L110 515Q70 420 80 318Z M643 96Q783 26 891 127L885 292 704 304Q622 199 643 96Z M278 489Q425 399 518 505L507 664 347 692 283 586Z M710 463Q828 409 897 497L913 620 806 651 709 592Z"/></g>
    ${Object.entries(COASTS).map(([id,path]) => { const d=coastline(path); return `<g class="land ${selected === id ? 'selected-land' : ''}"><path class="shore-band" d="${d}"/><path class="coast" d="${d}"/><path class="inland" d="${d}" transform="translate(${PORTS[id].x * .16} ${PORTS[id].y * .16}) scale(.84)"/></g>`; }).join('')}
    <g class="islets"><path d="M292 185 305 174 316 190 305 211 289 204Z M565 270 579 259 590 275 581 294 566 287Z M647 467 666 455 679 476 664 491 648 482Z M80 554 93 545 104 563 91 577 78 569Z M566 575 575 563 589 580 579 594Z"/></g>
    <g class="settlement"><path d="M390 267h18v20h-18zM420 251h15v24h-15zM448 276h24v17h-24zM390 311h22v13h-22zM474 341h19v23h-19zM409 356h16v20h-16zM451 375h19v12h-19zM422 289l19 66M386 338l109-33M160 391l44 23M151 399l37 24M151 454l45 17M350 552h42v45h-42zM427 528h29v22h-29zM737 147l14-21 16 21zM779 141l17-26 17 26zM756 222l12-17 12 17z"/><path class="grove" d="M350 506h60v34h-60zM406 594h34v27h-34z"/></g>
    <g class="routes">${Object.entries(ROUTES).map(([id,d]) => {
      const s = sites.find(site => site.id === id);
      return `<path data-route="${id}" class="sea-route ${s.open ? 'open' : 'unknown'} ${s.lit ? 'supplied' : ''} ${s.planned ? 'planned' : ''}" d="${d}"/>`;
    }).join('')}</g>
    <g class="north-mark"><path d="M935 66v48M924 84l11-18 11 18"/><text x="935" y="52">N</text></g>
    ${sites.filter(s => s.lit).map(s => `<g class="light-rays" transform="translate(${PORTS[s.id].x} ${PORTS[s.id].y})"><path d="M0-26v-10M0 26v10M-26 0h-10M26 0h10M-18-18l-7-7M18 18l7 7M18-18l7-7M-18 18l-7 7"/></g>`).join('')}
  </g></svg><div class="locations">${sites.map(s => {
    const place = PLACES[s.id];
    const annotation = mode === 'institutions' && s.open ? localRules(game,s.id).join(' / ') || place.allegiance : s.label;
    return `<button class="location ${s.lit ? 'lit' : ''} ${s.open ? 'connected' : 'unexplored'} ${s.planned ? 'planned' : ''}" style="left:${PORTS[s.id].x / 10}%;top:${PORTS[s.id].y / 8}%" data-place="${s.id}" aria-pressed="${s.id === selected}" aria-label="${place.name} auswählen"><span class="pin"><svg aria-hidden="true"><use href="#i-${place.icon}"/></svg></span><span class="location-label">${place.name}<small>${annotation}</small></span></button>`;
  }).join('')}</div>`;
}
