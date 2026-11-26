import type { BirthRoomHotspot } from './game/birthRoomData';
import type { CompassDirection } from './game/fireWatch';
import type {
  CollectibleLocation,
  InteriorCollectibleId,
} from './game/interiorCollectibles';
import type { PoiSpec, TelescopeId } from './game/pois';
import type { TimeOfDayMode } from './game/timeOfDay';

export type Language = 'cs' | 'en';

export interface Translations {
  title: {
    eyebrow: string;
    subtitle: string;
    enterBtn: string;
  };
  hud: {
    eyebrowInterior: string;
    eyebrowBellChamber: string;
    eyebrowChurchAttic: string;
    eyebrowChurchNave: string;
    eyebrowExterior: string;
    birthRoomTitle: string;
    bellChamberTitle: string;
    churchAtticTitle: string;
    churchNaveTitle: string;
    backToGallery: string;
    backToBirthRoom: string;
    backToBellChamber: string;
    backToChurchAttic: string;
    bellChamberHint: string;
    churchAtticHint: string;
    churchNaveHint: string;
    timeModes: Record<TimeOfDayMode, string>;
    timeToggleTitle: string;
    seasonWinter: string;
    seasonSummer: string;
    seasonToWinterTitle: string;
    seasonToSummerTitle: string;
    endFireWatch: string;
    endJackdawHunt: string;
    clickToLookHint: string;
    discoveredLandmarks: string;
    hideLandmarksTitle: string;
    showLandmarksTitle: string;
    birthRoomLabel: string;
    compass: Record<number, string>;
    compassFull: Record<CompassDirection, string>;
    compassSide: Record<CompassDirection, string>;
    youngMartinuCaption: string;
  };
  prompts: {
    reportFire: string;
    ringAlarmBell: string;
    hangSignalFlag: string;
    hangSignalLantern: string;
    enterBirthRoom: string;
    enterBellChamber: string;
    climbToBirthRoom: string;
    ringGreatBell: string;
    enterChurchAttic: string;
    returnToBellChamber: string;
    descendIntoChurch: string;
    climbToChurchAttic: string;
    playOrgan: string;
    stopOrgan: string;
    organNextMelody: string;
    organPlayingPrefix: string;
    organMelodies: readonly [string, string, string];
    lightCandle: string;
    sitOnPew: string;
    standUp: string;
    inspect: string;
    lookThroughDormer: string;
    exitDormer: string;
    startFireWatch: string;
    takeRifleHunt: string;
    useTelescope: string;
    clickOrE: string;
    startJackdawHunt: string;
    takeRifle: string;
  };
  controls: {
    title: string;
    buttonTitle: string;
    moveKey: string;
    moveDesc: string;
    sprintKey: string;
    sprintDesc: string;
    lookKey: string;
    lookDesc: string;
    interactDesc: string;
    cameraDesc: string;
    fireInteractDesc: string;
    lanternDesc: string;
    muteDesc: string;
    releaseMouseDesc: string;
  };
  telescope: {
    names: Record<TelescopeId, string>;
    discoveredSuffix: string;
    scanningPrefix: string;
    zoom: string;
    controlsHint: string;
    closeBtn: string;
    storyBadge: string;
    closeStory: string;
    replayScene: string;
    replaySceneAgain: string;
  };
  birthRoom: {
    storyBadge: string;
    hotspots: Record<BirthRoomHotspot['id'], { title: string; subtitle: string; story: string }>;
  };
  interiorCollectibles: {
    storyBadges: Record<CollectibleLocation, string>;
    items: Record<InteriorCollectibleId, { title: string; subtitle: string; story: string }>;
  };
  pois: Record<PoiSpec['id'], { title: string; subtitle: string; story: string }>;
  microScenes: Record<PoiSpec['id'], { caption: string; winterCaption?: string }>;
  fireWatch: {
    fireCounter: string;
    redFlag: string;
    redLantern: string;
    fireSpread: string;
    jumpPrefix: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Prefix: string;
    step2Suffix: string;
    step3Title: string;
    step3Prefix: string;
    step3Mid: string;
    step3Flag: string;
    step3Lantern: string;
    dispatchingPrefix: string;
    extinguishing: string;
    nextFireSoon: string;
    extinguishedNext: string;
    alertSpread: string;
    alertBurnedOut: string;
    offerAllDiscovered: string;
    offerQuestion: string;
    offerStart: string;
    offerLater: string;
    summaryEyebrow: string;
    summaryTitle: string;
    statSaved: string;
    statBurned: string;
    statResponseTime: string;
    statScore: string;
    ptsSuffix: string;
    ranks: {
      exemplary: string;
      vigilant: string;
      damaged: string;
    };
    historyTitle: string;
    historyBody1: string;
    historyHighlight1: string;
    historyBody2: string;
    historyHighlight2: string;
    historyBody3: string;
    backToFreeRoam: string;
    playAgain: string;
    locations: Record<string, string>;
  };
  jackdawHunt: {
    time: string;
    score: string;
    hintShoot: string;
    hintAim: string;
    hintExit: string;
    longShot: string;
    summaryEyebrow: string;
    newRecord: string;
    summaryTitle: string;
    statHits: string;
    statAccuracy: string;
    statScore: string;
    statBest: string;
    backToFreeRoam: string;
    playAgain: string;
  };
  toasts: {
    unlockedFireWatch: string;
    unlockedJackdawHunt: string;
    naveComingSoon: string;
  };
  settings: {
    title: string;
    eyebrow: string;
    openTitle: string;
    closeTitle: string;
    languageSection: string;
    languageLabel: string;
    audioSection: string;
    masterVolume: string;
    mute: string;
    unmute: string;
    sfxVolume: string;
    musicVolume: string;
    controlsSection: string;
    mouseSensitivity: string;
    graphicsSection: string;
    graphicsQuality: string;
    qualityHigh: string;
    qualityPerformance: string;
    qualityHighDesc: string;
    qualityPerformanceDesc: string;
    showFps: string;
    on: string;
    off: string;
    progressSection: string;
    resetProgress: string;
    resetConfirm: string;
    resetDesc: string;
  };
}

const CS: Translations = {
  title: {
    eyebrow: 'Polička · kolem roku 1900',
    subtitle: 'Věž kostela sv. Jakuba · Strážce města',
    enterBtn: 'Vstoupit na ochoz',
  },
  hud: {
    eyebrowInterior: 'Polička · cca 1900',
    eyebrowBellChamber: 'Polička · Zvonové patro',
    eyebrowChurchAttic: 'Polička · Půda kostela',
    eyebrowChurchNave: 'Polička · Kostel sv. Jakuba',
    eyebrowExterior: 'Polička · Ochoz',
    birthRoomTitle: 'Rodná světnička',
    bellChamberTitle: 'Zvonové patro',
    churchAtticTitle: 'Půda kostela',
    churchNaveTitle: 'Kostel sv. Jakuba',
    backToGallery: '[E] Zpět na ochoz',
    backToBirthRoom: '[E] Zpět do světničky',
    backToBellChamber: '[E] Zpět do zvonového patra',
    backToChurchAttic: '[E] Vystoupat na půdu',
    bellChamberHint: 'Zvon Jakub · Hodinový stroj · Žaluzie s výhledem na Poličku',
    churchAtticHint: 'Krov chrámové lodi · Dřevěné lávky · Rub gotických kleneb',
    churchNaveHint: 'Hlavní oltář · Vitráže presbytáře · Kůr s varhanami',
    timeModes: {
      auto: 'Auto',
      day: 'Den',
      sunset: 'Západ',
      night: 'Noc',
    },
    timeToggleTitle: 'Přepnout denní dobu (Auto → Den → Západ → Noc)',
    seasonWinter: 'Zima',
    seasonSummer: 'Léto',
    seasonToWinterTitle: 'Přepnout na zimu',
    seasonToSummerTitle: 'Přepnout na léto',
    endFireWatch: 'Ukončit hlídku',
    endJackdawHunt: 'Ukončit lov',
    clickToLookHint: 'Klikni pro rozhlížení · WASD pohyb · Shift běh · Esc uvolnit myš',
    discoveredLandmarks: 'Objevené památky',
    hideLandmarksTitle: 'Skrýt seznam památek',
    showLandmarksTitle: 'Zobrazit seznam památek',
    birthRoomLabel: 'Rodná světnička',
    compass: {
      0: 'S',
      45: 'SV',
      90: 'V',
      135: 'JV',
      180: 'J',
      225: 'JZ',
      270: 'Z',
      315: 'SZ',
    },
    compassFull: {
      north: 'Sever',
      south: 'Jih',
      east: 'Východ',
      west: 'Západ',
    },
    compassSide: {
      north: 'severní',
      south: 'jižní',
      east: 'východní',
      west: 'západní',
    },
    youngMartinuCaption: 'Mladý Bohuslav Martinů cvičí na housle',
  },
  prompts: {
    reportFire: 'Nahlásit zpozorovaný požár',
    ringAlarmBell: 'Zazvonit na poplašný zvon',
    hangSignalFlag: 'Vyvěsit červený prapor',
    hangSignalLantern: 'Vyvěsit červenou lucernu',
    enterBirthRoom: 'Vstoupit do rodné světničky',
    enterBellChamber: 'Vstoupit do zvonového patra',
    climbToBirthRoom: 'Vystoupit do rodné světničky',
    ringGreatBell: 'Zazvonit na zvon Jakub',
    enterChurchAttic: 'Vstoupit na půdu kostela',
    returnToBellChamber: 'Vystoupat do zvonového patra',
    descendIntoChurch: 'Sejít do kostela',
    climbToChurchAttic: 'Vystoupat na půdu kostela',
    playOrgan: 'Zahrát na varhany',
    stopOrgan: 'Zastavit varhany',
    organNextMelody: 'Další melodie',
    organPlayingPrefix: 'Hraje',
    organMelodies: [
      'Barokní chorál',
      'Pastorální motiv',
      'Novogotická kadence',
    ],
    lightCandle: 'Zapálit svíčku',
    sitOnPew: 'Sednout si na lavici',
    standUp: 'Vstát',
    inspect: 'Prozkoumat',
    lookThroughDormer: 'Vyhlédnout vikýřem',
    exitDormer: 'Zpět na půdu',
    startFireWatch: 'Spustit Požární hlídku',
    takeRifleHunt: 'Vzít pušku — Lov kavek',
    useTelescope: 'Podívat se dalekohledem',
    clickOrE: '[E] / Kliknout',
    startJackdawHunt: 'Spustit Lov kavek',
    takeRifle: 'Vzít pušku',
  },
  controls: {
    title: 'Ovládání',
    buttonTitle: 'Zobrazit nebo skrýt ovládání [H]',
    moveKey: 'WASD / Šipky',
    moveDesc: 'Pohyb po ochozu',
    sprintKey: 'Shift',
    sprintDesc: 'Běh',
    lookKey: 'Myš',
    lookDesc: 'Rozhlížení',
    interactDesc: 'Dalekohled, dveře, zvon, puška',
    cameraDesc: 'Přepnout 1. / 3. osobu',
    fireInteractDesc: 'Interakce (zvon, prapor)',
    lanternDesc: 'Lucerna (vytáhnout / schovat)',
    muteDesc: 'Ztlumit zvuk',
    releaseMouseDesc: 'Uvolnit myš',
  },
  telescope: {
    names: {
      south: 'Jižní dalekohled',
      east: 'Východní dalekohled',
      north: 'Severní dalekohled',
      west: 'Západní dalekohled',
    },
    discoveredSuffix: 'Objeveno',
    scanningPrefix: 'Zaměřování…',
    zoom: 'Zoom',
    controlsHint: 'Tažení / Šipky otáčení · Kolečko / W·S přiblížení',
    closeBtn: '[E] / [Esc] Zavřít',
    storyBadge: 'Historický záznam · Polička',
    closeStory: 'Zavřít',
    replayScene: 'Přehrát scénku',
    replaySceneAgain: 'Přehrát scénku znovu',
  },
  birthRoom: {
    storyBadge: 'Rodná světnička · 1900',
    hotspots: {
      'violin-stand': {
        title: 'Notový stojan a housle',
        subtitle: '8. prosince 1890 · Rodiště skladatele',
        story:
          'Právě v této malé věžní světničce se 8. prosince 1890 narodil světoznámý český skladatel Bohuslav Martinů. Jako chlapec trávil celé dny vysoko nad střechami Poličky, naslouchal zvonům i větru z Vysočiny a od šesti let cvičil na housle — nezaměnitelná perspektiva z ptačího pohledu se navždy propsala do jeho hudby.',
      },
      'window-view': {
        title: 'Okno s výhledem na město',
        subtitle: 'Práce pověžného · 192 schodů',
        story:
          'Bohuslavův otec Ferdinand Martinů byl švec a obecní pověžný. Z oken i ochozu hlídal, zda ve městě nebo v okolních vsích nehoří, a zvonil na poplach. Rodina musela veškerou vodu, uhlí i denní nákupy vynášet nahoru po 192 strmých schodech nebo vytahovat kladkou zavěšenou z věžního okna.',
      },
      'family-table': {
        title: 'Rodinný stůl a šicí stroj',
        subtitle: 'Domov pětičlenné rodiny · 36 m nad zemí',
        story:
          'V této jediné skromné světničce 36 metrů nad dlažbou žilo pět členů rodiny Martinů — rodiče Ferdinand a Karolina se třemi dětmi. U kulatého stolu pod petrolejovou lampou se jedlo, šilo na šicím stroji, spravovaly se boty i psaly první dětské noty.',
      },
    },
  },
  interiorCollectibles: {
    storyBadges: {
      bellChamber: 'Zvonové patro · 1845',
      churchAttic: 'Půda kostela · 1860',
      churchNave: 'Kostel sv. Jakuba · 1890',
    },
    items: {
      'bell-clapper': {
        title: 'Ulomené staré srdce zvonu',
        subtitle: 'Zvonová stolice · Památka na požár 1845',
        story:
          'Toto prasklé kované srdce přečkalo ničivý požár Poličky v roce 1845, který zničil starou kostelní věž a roztavil původní zvony. Po obnově věže jej pověžní opřeli o patu nové dubové zvonové stolice jako tichou připomínku bdělosti.',
      },
      'mason-arch-sketch': {
        title: 'Kamenický nákres lomeného oblouku',
        subtitle: 'Západní věžní zeď · Přestavba v 60. letech 19. stol.',
        story:
          'Křídový a rytý kamenický náčrt lomeného gotického oblouku na věžní zdi vyznačuje přesné místo, kde se starší středověké zdivo věže napojuje na novogotickou chrámovou loď přestavěnou v 60. letech 19. století.',
      },
      'baptismal-record': {
        title: 'Křestní zápis Bohuslava Martinů (1890)',
        subtitle: 'Farní matrika · Prosinec 1890',
        story:
          'Otevřená farní matrika na pultu u presbytáře uchovává prosincový křestní zápis malého Bohuslava Martinů z roku 1890 — chlapce narozeného vysoko nad městem v kostelní věžní světničce pověžného.',
      },
      'organist-notebook': {
        title: 'Notový sešit mladého varhaníka',
        subtitle: 'Kůr u varhan · Rané chorální náčrtky',
        story:
          'Na notovém pultu varhanního hracího stolu leží otevřený ručně psaný sešit s chorálními náčrtky mladého Bohuslava. Právě odtud z kůru nad chrámovou lodí naslouchal mohutnému hlasu varhan a zapisoval své první hudební představy.',
      },
    },
  },
  pois: {
    market: {
      title: 'Tržiště',
      subtitle: 'Palackého náměstí · 19. století',
      story:
        'Poličku založil roku 1265 český král Přemysl Otakar II. na důležité obchodní stezce. Na pravidelném obdélníkovém Palackého náměstí se po staletí konaly živé výroční trhy, kde se potkávali soukeníci, hrnčíři i kupci z Čech a Moravy.',
    },
    'town-hall': {
      title: 'Barokní radnice',
      subtitle: 'František Maxmilián Kaňka · 1739–1744',
      story:
        'Dominanta Palackého náměstí patří k barokním klenotům východních Čech. Byla postavena kolem starší gotické věže podle projektu F. M. Kaňky a svou žlutou fasádou s věžičkou dodnes připomíná slávu svobodného královského města.',
    },
    'plague-column': {
      title: 'Morový sloup',
      subtitle: 'Barokní sochařství · 1727–1731',
      story:
        'Dvaadvacet metrů vysoký barokní mariánský sloup stojí před radnicí jako poděkování za ochranu města před morovou epidemií roku 1713. Zdobí jej bohatá sochařská výzdoba českých patronů a zlacená socha Panny Marie na vrcholu.',
    },
    'medieval-gate': {
      title: 'Městské hradby',
      subtitle: 'Gotické opevnění · 19 bašt',
      story:
        'Poličku obepíná téměř dokonale zachovaný prstenec kamenných gotických hradeb z doby Karla IV. o délce přes 1,2 kilometru. Devatenáct půlválcových bašt chránilo královské město před nájezdy po celá staletí.',
    },
    brewery: {
      title: 'Měšťanský pivovar',
      subtitle: 'Založen 1517 · Nová budova 1865',
      story:
        'Právo várečné získali poličští měšťané už v roce 1517. V roce 1865 vyrostl tento moderní parostrojní pivovar za městskými hradbami a kolem roku 1900 zde pod vedením proslulého sládka Františka Bittnera vznikala pověst poctivého poličského piva.',
    },
    'synsky-pond': {
      title: 'Synský rybník',
      subtitle: 'Městský rybník · Ochrana před požáry',
      story:
        'Synský rybník přímo pod východními hradbami patřil po staletí k důležitému hospodářskému i obrannému zázemí města. Po ničivém požáru Poličky v roce 1845 navíc sloužil jako klíčová zásobárna vody pro hasiče a jeho hladina byla z věže neustále pod dohledem pověžného.',
    },
    'st-michael-cemetery': {
      title: 'Kostel sv. Michaela a hřbitov',
      subtitle: 'Renesančně-barokní chrám · Založen 1576',
      story:
        'Tento starobylý hřbitovní kostel na Horním předměstí pochází už z roku 1576 a kolem roku 1900 tvořil výraznou dominantu za západními hradbami. Na přilehlém hřbitově odpočívají generace poličských měšťanů – a zajímavostí pro dnešní návštěvníky je, že v roce 1979 sem byly uloženy i ostatky slavného rodáka z věže, skladatele Bohuslava Martinů.',
    },
    railway: {
      title: 'Železnice a parní vlak',
      subtitle: 'Trať Svitavy – Polička – Žďárec · 1896',
      story:
        'V roce 1896 dorazil do Poličky první parní vlak a o rok později byla trať prodloužena až do Žďárce u Skutče. Kolem roku 1900 byla železnice pro město obrovskou událostí – spojila Poličku se světem, zrychlila obchod s pivem i suknem a z věže kostela sv. Jakuba bylo vidět stoupající oblaka bílé páry daleko do kraje.',
    },
  },
  microScenes: {
    railway: {
      caption: 'Rok 1896: Do Poličky přijíždí první parní vlak a oblaka páry stoupají nad tratí.',
    },
    'town-hall': {
      caption:
        'Kolem roku 1900: Před vchodem do barokní radnice se scházejí měšťané za odbíjení věžních hodin.',
    },
    market: {
      caption:
        'Výroční trh na náměstí: Kupci a sousedé procházejí uličkou mezi stánky a prohlížejí zboží.',
    },
    'plague-column': {
      caption:
        'U mariánského sloupu z roku 1731 vzlétá hejno holubů nad hlavy přihlížejících měšťanů.',
    },
    'medieval-gate': {
      caption:
        'Gotické hradby Karla IV.: Ponocný s lucernou obchází vnější stezku podél kamenné bašty.',
    },
    brewery: {
      caption:
        'Pivovar sládka Františka Bittnera: U brány se nakládají sudy a po cestě projíždí pivovarský povoz.',
    },
    'synsky-pond': {
      caption:
        'Na klidné hladině Synského rybníka klouže dřevěná loďka a nad vodou vyskakují ryby.',
      winterCaption:
        'Zima na Synském rybníku: Po zamrzlé hladině kloužou bruslaři v chladném podvečerním vzduchu.',
    },
    'st-michael-cemetery': {
      caption:
        'Kostel sv. Michaela z roku 1576: Po hřbitovní cestě kráčejí návštěvníci a na hrobech se rozsvěcují svíce.',
    },
  },
  fireWatch: {
    fireCounter: 'Požár',
    redFlag: 'Červený prapor',
    redLantern: 'Červená lucerna',
    fireSpread: 'Šíření požáru',
    jumpPrefix: 'přeskok',
    step1Title: '1. Zpozoruj požár:',
    step1Desc: 'Rozhlédni se po městě (očima nebo dalekohledem [E]) a zaměř kouř a plameny.',
    step2Title: '2. Zazvoň na poplach:',
    step2Prefix: 'Požár hlášen (',
    step2Suffix: '). Dojdi k provazu poplašného zvonu u dveří a stiskni',
    step3Title: '3. Vyvěs znamení:',
    step3Prefix: 'Dojdi na',
    step3Mid: 'stranu ochozu a vyvěs',
    step3Flag: 'červený prapor',
    step3Lantern: 'červenou lucernu',
    dispatchingPrefix: 'Koňská hasičská stříkačka vyjíždí z Palackého náměstí k požáru',
    extinguishing: 'Hasiči dorazili na místo a hasí plameny!',
    nextFireSoon: 'Připrav se na další hlášení požáru…',
    extinguishedNext: 'Požár uhašen! Připrav se na další hlídku…',
    alertSpread: 'Oheň se rozšířil na sousední dům!',
    alertBurnedOut: 'Požár zničil tři domy a vyhořel!',
    offerAllDiscovered: 'Všechny památky objeveny',
    offerQuestion: 'Zahájit noční požární hlídku?',
    offerStart: 'Zahájit hlídku',
    offerLater: 'Později',
    summaryEyebrow: 'Polička · Požární hlídka dokončena',
    summaryTitle: 'Závěr požární hlídky',
    statSaved: 'Zachráněné',
    statBurned: 'Shořelo domů',
    statResponseTime: 'Čas zásahu',
    statScore: 'Hodnocení',
    ptsSuffix: 'b.',
    ranks: {
      exemplary: 'Vzorný pověžný',
      vigilant: 'Bdělý strážce',
      damaged: 'Polička utrpěla škody',
    },
    historyTitle: 'Historická poznámka',
    historyBody1: 'Po ničivém ',
    historyHighlight1: 'velkém požáru Poličky v roce 1845',
    historyBody2:
      ', který zničil podstatnou část historického města, byla nepřetržitá služba pověžného na věži kostela sv. Jakuba naprosto klíčová. Tuto odpovědnou službu vykonával i ',
    historyHighlight2: 'Ferdinand Martinů',
    historyBody3:
      ', otec skladatele Bohuslava Martinů, který s rodinou bydlel přímo v horní věžní světničce. Při spatření ohně pověžný okamžitě zvonil na poplach a vyvěšoval ze správné strany ochozu ve dne červený prapor a v noci červenou lucernu, aby hasiči věděli, kterým směrem vyrazit.',
    backToFreeRoam: 'Zpět do volné prohlídky',
    playAgain: 'Hrát hlídku znovu',
    locations: {
      'south-barns': 'Stodola u Synského rybníka',
      'south-barns-adj-1': 'Sousední stodola u rybníka',
      'south-barns-adj-2': 'Krajní stodola na jižním břehu',
      'west-st-michael': 'Chalupa u kostela sv. Michaela',
      'west-st-michael-adj-1': 'Sousední chalupa na Horním předměstí',
      'west-st-michael-adj-2': 'Chalupa při západní cestě',
      'brewery-yard': 'Měšťanský pivovar',
      'brewery-yard-adj-1': 'Sladovna Měšťanského pivovaru',
      'brewery-yard-adj-2': 'Hospodářské křídlo pivovaru',
      'north-townhouse': 'Měšťanský dům u severní čtvrti',
      'north-townhouse-adj-1': 'Sousední měšťanský dům',
      'north-townhouse-adj-2': 'Rohový dům u severních hradeb',
      'east-factory': 'Továrna za východními hradbami',
      'east-factory-adj-1': 'Východní sklad továrny',
      'east-factory-adj-2': 'Východní mlýn u potoka',
    },
  },
  jackdawHunt: {
    time: 'Čas',
    score: 'Skóre',
    hintShoot: 'Střelba',
    hintAim: 'Míření',
    hintExit: 'Konec',
    longShot: 'Dlouhá rána!',
    summaryEyebrow: 'Polička · Lov kavek dokončen',
    newRecord: 'Nový rekord',
    summaryTitle: 'Výsledky lovu kavek',
    statHits: 'Zásahy',
    statAccuracy: 'Přesnost',
    statScore: 'Skóre',
    statBest: 'Rekord',
    backToFreeRoam: 'Zpět do volné prohlídky',
    playAgain: 'Hrát znovu',
  },
  toasts: {
    unlockedFireWatch: 'Odemčena minihra: Požární hlídka',
    unlockedJackdawHunt: 'Odemčena minihra: Lov kavek',
    naveComingSoon: 'Sestup do hlavní lodi kostela sv. Jakuba bude zpřístupněn v dalším kroku.',
  },
  settings: {
    title: 'Nastavení',
    eyebrow: 'Polička · Předvolby',
    openTitle: 'Otevřít nastavení',
    closeTitle: 'Zavřít nastavení',
    languageSection: 'Jazyk',
    languageLabel: 'Jazyk rozhraní',
    audioSection: 'Zvuk',
    masterVolume: 'Celková hlasitost',
    mute: 'Ztlumit',
    unmute: 'Zapnout zvuk',
    sfxVolume: 'Prostředí a efekty',
    musicVolume: 'Hudba / Housle',
    controlsSection: 'Ovládání',
    mouseSensitivity: 'Citlivost myši',
    graphicsSection: 'Grafika a výkon',
    graphicsQuality: 'Kvalita zobrazení',
    qualityHigh: 'Vysoká',
    qualityPerformance: 'Úsporná',
    qualityHighDesc: 'Plné stíny a ostré rozlišení (DPR 1.5)',
    qualityPerformanceDesc: 'Vypnuté stíny v reálném čase a nižší DPR pro plynulý chod',
    showFps: 'Zobrazit počítadlo FPS',
    on: 'Zap',
    off: 'Vyp',
    progressSection: 'Postup ve hře',
    resetProgress: 'Resetovat postup',
    resetConfirm: 'Opravdu resetovat?',
    resetDesc: 'Vymaže objevené památky (0 / 8) a návštěvu rodné světničky.',
  },
};

const EN: Translations = {
  title: {
    eyebrow: 'Polička · circa 1900',
    subtitle: 'St. James Church Tower · Guardian of the Town',
    enterBtn: 'Step onto the Gallery',
  },
  hud: {
    eyebrowInterior: 'Polička · ca. 1900',
    eyebrowBellChamber: 'Polička · Bell Chamber',
    eyebrowChurchAttic: 'Polička · Church Attic',
    eyebrowChurchNave: 'Polička · St. Jacob’s Church',
    eyebrowExterior: 'Polička · Gallery',
    birthRoomTitle: 'Birth Room',
    bellChamberTitle: 'Bell Chamber',
    churchAtticTitle: 'Church Attic',
    churchNaveTitle: 'St. Jacob’s Church',
    backToGallery: '[E] Back to Gallery',
    backToBirthRoom: '[E] Climb to Birth Room',
    backToBellChamber: '[E] Return to Bell Chamber',
    backToChurchAttic: '[E] Climb to Attic',
    bellChamberHint: 'Great Bell Jakub · Tower Clockwork · Louvered Belfry Windows',
    churchAtticHint: 'Nave Roof Truss · Wooden Catwalks · Gothic Vault Shells',
    churchNaveHint: 'High Altar · Presbytery Stained Glass · Organ Loft',
    timeModes: {
      auto: 'Auto',
      day: 'Day',
      sunset: 'Sunset',
      night: 'Night',
    },
    timeToggleTitle: 'Cycle time of day (Auto → Day → Sunset → Night)',
    seasonWinter: 'Winter',
    seasonSummer: 'Summer',
    seasonToWinterTitle: 'Switch to Winter',
    seasonToSummerTitle: 'Switch to Summer',
    endFireWatch: 'End Fire Watch',
    endJackdawHunt: 'End Hunt',
    clickToLookHint: 'Click to look · WASD to move · Shift to sprint · Esc to release mouse',
    discoveredLandmarks: 'Discovered Landmarks',
    hideLandmarksTitle: 'Hide landmark list',
    showLandmarksTitle: 'Show landmark list',
    birthRoomLabel: 'Birth Room',
    compass: {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SW',
      270: 'W',
      315: 'NW',
    },
    compassFull: {
      north: 'North',
      south: 'South',
      east: 'East',
      west: 'West',
    },
    compassSide: {
      north: 'northern',
      south: 'southern',
      east: 'eastern',
      west: 'western',
    },
    youngMartinuCaption: 'Young Bohuslav Martinů practicing the violin',
  },
  prompts: {
    reportFire: 'Report spotted fire',
    ringAlarmBell: 'Ring the alarm bell',
    hangSignalFlag: 'Hang red signal flag',
    hangSignalLantern: 'Hang red signal lantern',
    enterBirthRoom: 'Enter the Birth Room',
    enterBellChamber: 'Enter Bell Chamber',
    climbToBirthRoom: 'Climb to Birth Room',
    ringGreatBell: 'Ring the Bell',
    enterChurchAttic: 'Enter Church Attic',
    returnToBellChamber: 'Climb to Bell Chamber',
    descendIntoChurch: 'Descend into Church',
    climbToChurchAttic: 'Climb to Church Attic',
    playOrgan: 'Play Organ',
    stopOrgan: 'Stop Organ',
    organNextMelody: 'Next Melody',
    organPlayingPrefix: 'Playing',
    organMelodies: [
      'Baroque Chorale',
      'Pastoral Motif',
      'Neo-Gothic Cadence',
    ],
    lightCandle: 'Light a Candle',
    sitOnPew: 'Sit on Pew',
    standUp: 'Stand Up',
    inspect: 'Inspect',
    lookThroughDormer: 'Look Through Dormer',
    exitDormer: 'Step Back from Dormer',
    startFireWatch: 'Start Fire Watch',
    takeRifleHunt: 'Take Rifle — Jackdaw Hunt',
    useTelescope: 'Look through telescope',
    clickOrE: '[E] / Click',
    startJackdawHunt: 'Start Jackdaw Hunt',
    takeRifle: 'Inspect rifle',
  },
  controls: {
    title: 'Controls',
    buttonTitle: 'Show or hide controls [H]',
    moveKey: 'WASD / Arrows',
    moveDesc: 'Move along gallery',
    sprintKey: 'Shift',
    sprintDesc: 'Sprint',
    lookKey: 'Mouse',
    lookDesc: 'Look around',
    interactDesc: 'Telescope, door, bell, rifle',
    cameraDesc: 'Toggle 1st / 3rd person',
    fireInteractDesc: 'Interact (bell, signal)',
    lanternDesc: 'Lantern (raise / stow)',
    muteDesc: 'Mute audio',
    releaseMouseDesc: 'Release mouse',
  },
  telescope: {
    names: {
      south: 'South Telescope',
      east: 'East Telescope',
      north: 'North Telescope',
      west: 'West Telescope',
    },
    discoveredSuffix: 'Discovered',
    scanningPrefix: 'Focusing…',
    zoom: 'Zoom',
    controlsHint: 'Drag / Arrows to pan · Scroll / W·S to zoom',
    closeBtn: '[E] / [Esc] Close',
    storyBadge: 'Historical Record · Polička',
    closeStory: 'Close',
    replayScene: 'Replay Scene',
    replaySceneAgain: 'Replay Scene Again',
  },
  birthRoom: {
    storyBadge: 'Birth Room · 1900',
    hotspots: {
      'violin-stand': {
        title: 'Music Stand & Violin',
        subtitle: 'December 8, 1890 · Composer’s Birthplace',
        story:
          'In this small tower chamber, world-renowned Czech composer Bohuslav Martinů was born on December 8, 1890. As a boy he spent his days high above the rooftops of Polička, listening to church bells and winds from the Highlands, practicing violin from age six — a bird’s-eye perspective that shaped his music forever.',
      },
      'window-view': {
        title: 'Window Overlooking the Town',
        subtitle: 'Tower Keeper’s Duty · 192 Steps',
        story:
          'Bohuslav’s father Ferdinand Martinů was a shoemaker and the town tower keeper. From these windows and the gallery he watched for fires across Polička and nearby villages, ringing the alarm bell when danger struck. Every bucket of water, coal, and groceries had to be carried up 192 steep stairs or hoisted by pulley.',
      },
      'family-table': {
        title: 'Family Table & Sewing Machine',
        subtitle: 'Home of Five · 36 m Above Ground',
        story:
          'Five members of the Martinů family lived in this single modest chamber 36 meters above the cobblestones — parents Ferdinand and Karolina with their three children. Around the round table beneath the kerosene lamp they shared meals, sewed, mended shoes, and penned Bohuslav’s earliest childhood notes.',
      },
    },
  },
  interiorCollectibles: {
    storyBadges: {
      bellChamber: 'Bell Chamber · 1845',
      churchAttic: 'Church Attic · 1860',
      churchNave: 'St. Jacob’s Church · 1890',
    },
    items: {
      'bell-clapper': {
        title: 'Cracked Old Bell Clapper',
        subtitle: 'Belfry Frame · Relic of the 1845 Fire',
        story:
          'This cracked forged-iron clapper survived the devastating 1845 Polička town fire that destroyed the old church tower and melted its original bells. When the tower was rebuilt, the keepers leaned the broken clapper against the base of the new oak belfry frame as a lasting reminder of vigilance.',
      },
      'mason-arch-sketch': {
        title: 'Stonemason’s Gothic Arch Sketch',
        subtitle: 'West Tower Wall · 1860s Reconstruction',
        story:
          'Faint scribed arcs and chalk layout lines of a pointed Gothic arch on the stone tower wall mark the exact architectural seam where the older medieval masonry meets the rebuilt 1860s neo-Gothic nave.',
      },
      'baptismal-record': {
        title: 'Baptismal Record of Bohuslav Martinů (1890)',
        subtitle: 'Parish Register · December 1890',
        story:
          'The open parish register on the lectern beside the presbytery steps preserves the December 1890 baptismal entry for young Bohuslav Martinů, born high above Polička in the church tower watchman’s room.',
      },
      'organist-notebook': {
        title: 'Young Organist’s Music Notebook',
        subtitle: 'Organ Loft Console · Early Chorale Sketches',
        story:
          'Resting on the music rack of the organ console up on the loft, this open notebook holds young Bohuslav’s handwritten chorale sketches — inspired by listening to the church organ echo across the nave below.',
      },
    },
  },
  pois: {
    market: {
      title: 'Main Square Market',
      subtitle: 'Palackého Square · 19th Century',
      story:
        'Polička was founded in 1265 by Czech King Přemysl Otakar II along a vital trade route. For centuries, lively annual fairs filled the rectangular Palackého Square, gathering clothmakers, potters, and merchants from across Bohemia and Moravia.',
    },
    'town-hall': {
      title: 'Baroque Town Hall',
      subtitle: 'František Maxmilián Kaňka · 1739–1744',
      story:
        'The centerpiece of Palackého Square is one of the Baroque jewels of Eastern Bohemia. Built around an older Gothic tower to designs by F. M. Kaňka, its ochre facade and slender clock turret still recall the pride of a royal dowry town.',
    },
    'plague-column': {
      title: 'Plague Column',
      subtitle: 'Baroque Sculpture · 1727–1731',
      story:
        'Standing 22 meters tall before the Town Hall, this Baroque Marian column was raised in gratitude for sparing Polička from the 1713 plague epidemic. It is richly adorned with Bohemian patron saints and crowned by a gilded statue of the Virgin Mary.',
    },
    'medieval-gate': {
      title: 'Medieval City Walls',
      subtitle: 'Gothic Fortifications · 19 Bastions',
      story:
        'Polička is encircled by an almost intact ring of stone Gothic fortifications from the reign of Charles IV, stretching over 1.2 kilometers. Nineteen semicircular bastions guarded the royal town against sieges for centuries.',
    },
    brewery: {
      title: 'Municipal Brewery',
      subtitle: 'Founded 1517 · Steam Brewery 1865',
      story:
        'Polička’s burghers received brewing rights as early as 1517. In 1865 this modern steam-powered brewery rose outside the city walls, and around 1900 master brewer František Bittner cemented the enduring reputation of Polička beer.',
    },
    'synsky-pond': {
      title: 'Synský Pond',
      subtitle: 'Town Pond · Fire Reservoir',
      story:
        'Lying just beneath the eastern fortifications, Synský Pond served for centuries as both an economic and defensive asset. After the devastating 1845 fire, it became a vital water reservoir for firefighters, constantly watched from the church tower.',
    },
    'st-michael-cemetery': {
      title: 'St. Michael Church & Cemetery',
      subtitle: 'Renaissance-Baroque Church · Est. 1576',
      story:
        'This ancient cemetery church in the Upper Suburb dates back to 1576 and stood as a prominent landmark beyond the western walls around 1900. Generations of townsfolk rest here — and in 1979 the remains of Polička’s famous son, composer Bohuslav Martinů, were laid to rest on its grounds.',
    },
    railway: {
      title: 'Railway & Steam Train',
      subtitle: 'Svitavy – Polička – Žďárec Line · 1896',
      story:
        'In 1896 the first steam train arrived in Polička, and a year later the line extended to Žďárec u Skutče. Around 1900 the railway was a landmark achievement, linking the town with the wider world while white plumes of steam drifted across the valley below St. James tower.',
    },
  },
  microScenes: {
    railway: {
      caption: '1896: The first steam train pulls into Polička as clouds of white steam rise over the track.',
    },
    'town-hall': {
      caption:
        'Circa 1900: Townsfolk gather before the Baroque Town Hall as the tower clock strikes the hour.',
    },
    market: {
      caption:
        'Annual market day: Merchants and neighbors stroll between wooden stalls examining wares.',
    },
    'plague-column': {
      caption:
        'By the 1731 Marian Column, a flock of pigeons takes flight above gathered townspeople.',
    },
    'medieval-gate': {
      caption:
        'Charles IV’s Gothic walls: A night watchman with a lantern patrols the outer path beside the bastion.',
    },
    brewery: {
      caption:
        'Master brewer František Bittner’s brewery: Barrels are loaded at the gate as a brewery dray rolls past.',
    },
    'synsky-pond': {
      caption:
        'On the calm waters of Synský Pond, a wooden rowboat glides past leaping fish.',
      winterCaption:
        'Winter on Synský Pond: Skaters glide across the frozen ice in the crisp evening air.',
    },
    'st-michael-cemetery': {
      caption:
        'St. Michael Church (1576): Visitors walk the cemetery path as warm candles glow upon the graves.',
    },
  },
  fireWatch: {
    fireCounter: 'Fire',
    redFlag: 'Red Flag',
    redLantern: 'Red Lantern',
    fireSpread: 'Fire Spread',
    jumpPrefix: 'spread',
    step1Title: '1. Spot the fire:',
    step1Desc: 'Scan the town (by eye or telescope [E]) and lock onto the smoke and flames.',
    step2Title: '2. Ring the alarm:',
    step2Prefix: 'Fire reported (',
    step2Suffix: '). Head to the alarm bell rope by the door and press',
    step3Title: '3. Hang the signal:',
    step3Prefix: 'Go to the',
    step3Mid: 'side of the gallery and hang the',
    step3Flag: 'red flag',
    step3Lantern: 'red lantern',
    dispatchingPrefix: 'The horse-drawn fire engine is racing from Palackého Square toward',
    extinguishing: 'Firefighters have arrived and are dousing the flames!',
    nextFireSoon: 'Stand by for the next fire report…',
    extinguishedNext: 'Fire extinguished! Stand by for the next watch…',
    alertSpread: 'The fire has spread to a neighboring building!',
    alertBurnedOut: 'The fire destroyed three buildings and burned out!',
    offerAllDiscovered: 'All landmarks discovered',
    offerQuestion: 'Begin the night Fire Watch?',
    offerStart: 'Start Watch',
    offerLater: 'Later',
    summaryEyebrow: 'Polička · Fire Watch Complete',
    summaryTitle: 'Fire Watch Report',
    statSaved: 'Saved',
    statBurned: 'Burned',
    statResponseTime: 'Response',
    statScore: 'Score',
    ptsSuffix: 'pts',
    ranks: {
      exemplary: 'Exemplary Keeper',
      vigilant: 'Vigilant Watchman',
      damaged: 'Polička Suffered Losses',
    },
    historyTitle: 'Historical Note',
    historyBody1: 'After the devastating ',
    historyHighlight1: 'Great Fire of Polička in 1845',
    historyBody2:
      ', which destroyed much of the historic town, a round-the-clock watch from St. James Church tower became vital. This duty was carried out by ',
    historyHighlight2: 'Ferdinand Martinů',
    historyBody3:
      ', father of composer Bohuslav Martinů, who lived with his family in the upper tower chamber. Upon spotting a blaze, the keeper immediately rang the alarm bell and hung a red flag by day or a red lantern by night on the side facing the fire so brigades knew which direction to ride.',
    backToFreeRoam: 'Back to Free Roam',
    playAgain: 'Play Watch Again',
    locations: {
      'south-barns': 'Barn by Synský Pond',
      'south-barns-adj-1': 'Neighboring Pond Barn',
      'south-barns-adj-2': 'South Bank End Barn',
      'west-st-michael': 'Cottage near St. Michael Church',
      'west-st-michael-adj-1': 'Neighboring Upper Suburb Cottage',
      'west-st-michael-adj-2': 'West Road Cottage',
      'brewery-yard': 'Municipal Brewery',
      'brewery-yard-adj-1': 'Brewery Malthouse',
      'brewery-yard-adj-2': 'Brewery Courtyard Wing',
      'north-townhouse': 'North Quarter Townhouse',
      'north-townhouse-adj-1': 'Adjacent Townhouse',
      'north-townhouse-adj-2': 'Corner House by North Walls',
      'east-factory': 'Factory Beyond East Walls',
      'east-factory-adj-1': 'East Factory Warehouse',
      'east-factory-adj-2': 'East Creek Mill',
    },
  },
  jackdawHunt: {
    time: 'Time',
    score: 'Score',
    hintShoot: 'Shoot',
    hintAim: 'Aim',
    hintExit: 'Exit',
    longShot: 'Long Shot!',
    summaryEyebrow: 'Polička · Jackdaw Hunt Complete',
    newRecord: 'New Best',
    summaryTitle: 'Jackdaw Hunt Results',
    statHits: 'Hits',
    statAccuracy: 'Accuracy',
    statScore: 'Score',
    statBest: 'Best',
    backToFreeRoam: 'Back to Free Roam',
    playAgain: 'Play Again',
  },
  toasts: {
    unlockedFireWatch: 'Minigame Unlocked: Fire Watch',
    unlockedJackdawHunt: 'Minigame Unlocked: Jackdaw Hunt',
    naveComingSoon: 'Descent into St. Jacob’s Church Nave will open in Step 2.',
  },
  settings: {
    title: 'Settings',
    eyebrow: 'Polička · Preferences',
    openTitle: 'Open Settings',
    closeTitle: 'Close Settings',
    languageSection: 'Language',
    languageLabel: 'Interface Language',
    audioSection: 'Audio',
    masterVolume: 'Master Volume',
    mute: 'Mute',
    unmute: 'Unmute',
    sfxVolume: 'Ambient & SFX',
    musicVolume: 'Music / Violin',
    controlsSection: 'Controls',
    mouseSensitivity: 'Mouse Sensitivity',
    graphicsSection: 'Graphics & Performance',
    graphicsQuality: 'Graphics Quality',
    qualityHigh: 'High',
    qualityPerformance: 'Performance',
    qualityHighDesc: 'Full real-time shadows & sharp resolution (DPR 1.5)',
    qualityPerformanceDesc: 'Disables real-time shadows & caps DPR to 1 for higher FPS',
    showFps: 'Show FPS Counter',
    on: 'On',
    off: 'Off',
    progressSection: 'Game Progress',
    resetProgress: 'Reset Progress',
    resetConfirm: 'Confirm reset?',
    resetDesc: 'Clears discovered landmarks (0 / 8) and Birth Room progress.',
  },
};

export function getTranslations(lang: Language): Translations {
  return lang === 'en' ? EN : CS;
}
