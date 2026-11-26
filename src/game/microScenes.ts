import type { PoiSpec } from './pois';

export interface MicroSceneSpec {
  poiId: PoiSpec['id'];
  /** Total vignette duration in seconds (~5–7s) */
  durationSec: number;
  /** Short, emoji-free 1-sentence Czech historical caption shown while playing */
  captionCz: string;
}

export interface ActiveMicroScene {
  poiId: PoiSpec['id'];
  /** Monotonic play counter so replaying the same landmark cleanly restarts its timeline */
  playId: number;
}

export const MICRO_SCENES: Record<PoiSpec['id'], MicroSceneSpec> = {
  railway: {
    poiId: 'railway',
    durationSec: 6.4,
    captionCz:
      'Rok 1896: Do Poličky přijíždí první parní vlak a oblaka páry stoupají nad tratí.',
  },
  'town-hall': {
    poiId: 'town-hall',
    durationSec: 6.2,
    captionCz:
      'Kolem roku 1900: Před vchodem do barokní radnice se scházejí měšťané za odbíjení věžních hodin.',
  },
  market: {
    poiId: 'market',
    durationSec: 6.2,
    captionCz:
      'Výroční trh na náměstí: Kupci a sousedé procházejí uličkou mezi stánky a prohlížejí zboží.',
  },
  'plague-column': {
    poiId: 'plague-column',
    durationSec: 6.2,
    captionCz:
      'U mariánského sloupu z roku 1731 vzlétá hejno holubů nad hlavy přihlížejících měšťanů.',
  },
  'medieval-gate': {
    poiId: 'medieval-gate',
    durationSec: 6.2,
    captionCz:
      'Gotické hradby Karla IV.: Ponocný s lucernou obchází vnější stezku podél kamenné bašty.',
  },
  brewery: {
    poiId: 'brewery',
    durationSec: 6.4,
    captionCz:
      'Pivovar sládka Františka Bittnera: U brány se nakládají sudy a po cestě projíždí pivovarský povoz.',
  },
  'synsky-pond': {
    poiId: 'synsky-pond',
    durationSec: 6.2,
    captionCz:
      'Na klidné hladině Synského rybníka klouže dřevěná loďka a nad vodou vyskakují ryby.',
  },
  'st-michael-cemetery': {
    poiId: 'st-michael-cemetery',
    durationSec: 6.4,
    captionCz:
      'Kostel sv. Michaela z roku 1576: Po hřbitovní cestě kráčejí návštěvníci a na hrobech se rozsvěcují svíce.',
  },
};
