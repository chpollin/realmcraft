// Prototyp-Fixture für das Spielbrett. Der echte Regelkern ersetzt diese Daten später.
// Positionen sind axiale Hex-Offsets zum Hauptlager (pointy-top, dq+1 Osten, dr+1 Südosten, dr-1 Nordosten).

export const SPIELSTAND = {
  volk: { id: 'spieler', name: 'Hochvolk der Grauen Kämme', kurz: 'Graue Kämme' },

  zeit: { saison: 'Herbst', jahr: 3 },
  naechsteZeit: { saison: 'Winter', jahr: 3 },

  ressourcen: [
    { key: 'nahrung', name: 'Nahrung', wert: 9, trend: -1, grund: 'Die Vorräte reichen nicht über den ganzen Winter.' },
    { key: 'material', name: 'Material', wert: 14, trend: 0, grund: 'Holz und Stein aus Wald und Hang ersetzen, was die Feuer und Jurten verbrauchen.' },
    { key: 'wissen', name: 'Wissen', wert: 6, trend: 1, grund: 'Die Späher kehren mit neuen Pfaden zurück.' },
    { key: 'volk', name: 'Volk', wert: 14, trend: 0, grund: 'Es gab in diesem Jahr weder Zuzug noch Verluste.' },
    { key: 'zustimmung', name: 'Zustimmung', wert: 12, trend: 0, grund: 'Die Herden gedeihen, doch die Sorge vor dem Winter wächst.' }
  ],

  // Special goods of the world and its modules. Only active ones show in the
  // top bar; the others appear when the people first holds them.
  modulRessourcen: [
    { key: 'herden', name: 'Herden', wert: 6, trend: 0, grund: 'Die Ziegen und Schafe tragen Milch, Wolle und Fleisch.', aktiv: true },
    { key: 'erz', name: 'Erz', wert: 5, trend: 1, grund: 'Die Schmiede bringen Erz vom Roten Hang.', aktiv: true },
    { key: 'salz', name: 'Salz', wert: 0, trend: 1, grund: 'Salz kommt nur über den Talbund ins Hochland.', aktiv: false },
    { key: 'psil', name: 'Psil', wert: 0, trend: 1, grund: 'Die Ruine birgt ein blaues Pulver, das die Schauenden nutzen.', aktiv: false },
    { key: 'opfer', name: 'Opfer', wert: 0, trend: 0, grund: 'Das Bannfeuer verlangt Gaben aus dem Volk.', aktiv: false }
  ],

  bestimmung: {
    name: 'Überdauern in den Kämmen',
    art: 'start',
    meilensteine: [
      { text: 'Drei Weideplätze dauerhaft gesichert', stand: '3 von 3', erreicht: true },
      { text: 'Vier Winter ohne Hungertote', stand: '2 von 4', erreicht: false },
      { text: 'Fünf Pfadzeichen im Gebirge', stand: '4 von 5', erreicht: false },
      { text: 'Eine Wintersiedlung mit Vorrat für das ganze Volk', stand: '0 von 1', erreicht: false }
    ],
    wechsel: [
      {
        name: 'Uneinnehmbare Feste',
        weil: 'das Volk jeden Herbst den Grauhang mit Steinen sichert und die Schmiede neue Waffen für den Pass erproben',
        preis: 'Zustimmung minus 2 und die Loyalität der Ältesten der Herden sinkt um 2.',
        meilensteine: [
          'Den Hohlpass mit einem Wall sperren',
          'Zwei Winter ohne Verlust an Wehrfähigen',
          'Eine Feste mit eigener Schmiede im Fels'
        ]
      },
      {
        name: 'Herrschaft der Schauenden',
        weil: 'die Feuerhüterin und die Schauenden am Schrein immer mehr Fragen des Volkes entscheiden',
        preis: 'Zustimmung minus 2 und die Loyalität des Pfadmeisters sinkt um 2.',
        meilensteine: [
          'Drei Schreine im Gebirge geweiht',
          'Psil aus einer Ruine geborgen und genutzt',
          'Ein Rat der Schauenden steht über den Ältesten'
        ]
      }
    ]
  },

  rat: [
    {
      id: 'ulrun',
      name: 'Ulrun vom Weidenhang',
      rolle: 'Älteste der Herden',
      ziel: 'Die Herden und das Weiderecht sollen jeden Winter unversehrt bleiben.',
      loyalitaet: 3,
      lebensstand: 'rüstig'
    },
    {
      id: 'torhild',
      name: 'Torhild Aschenhand',
      rolle: 'Feuerhüterin',
      ziel: 'Die Flamme der Ahnen soll die Mitte des Volkes bleiben.',
      loyalitaet: 1,
      lebensstand: 'rüstig'
    },
    {
      id: 'garmund',
      name: 'Garmund Steinläufer',
      rolle: 'Pfadmeister',
      ziel: 'Neue Pfade finden, bevor die Schädelklan sie finden.',
      loyalitaet: -2,
      lebensstand: 'gealtert'
    },
    {
      id: 'brandur',
      name: 'Brandur Eisenfaust',
      rolle: 'Schmied',
      ziel: 'Die Schmiede sollen mit neuen Mitteln und Öfen arbeiten dürfen.',
      loyalitaet: 4,
      lebensstand: 'kräftig'
    }
  ],

  ratsfrage: {
    titel: 'Soll das Volk die Lehre des Bannfeuers annehmen?',
    worum: 'Die Feuerhüterin will den Pass mit einem dunklen Feuer schützen, das sich von Opfern nährt.',
    stimmen: [
      {
        id: 'torhild',
        wahl: 'ja',
        zitat: 'Das Feuer hat uns durch drei Winter getragen. Es wird auch den Pass tragen.',
        loyalitaetBeiAnnahme: 2,
        loyalitaetBeiVeto: -2
      },
      {
        id: 'garmund',
        wahl: 'ja',
        zitat: 'Ein Feuer am Pass sieht jeder Späher des Klans. Das schreckt sie mehr als Mauern.',
        loyalitaetBeiAnnahme: 1,
        loyalitaetBeiVeto: -1
      },
      {
        id: 'ulrun',
        wahl: 'nein',
        zitat: 'Wer ein Opfer gibt, gibt bald das nächste. Das Volk soll nicht lernen, vor der Flamme zu zittern.',
        loyalitaetBeiAnnahme: -2,
        loyalitaetBeiVeto: 1
      },
      {
        id: 'brandur',
        wahl: 'enthaltung',
        zitat: 'Ich schmiede lieber einen Wall aus Stein und Pulver. Über das Feuer sollen andere richten.',
        loyalitaetBeiAnnahme: -1,
        loyalitaetBeiVeto: 0
      }
    ],
    folgenAnnahme: [
      { icon: 'magie', wert: 'Bannfeuer', text: 'Eine neue Entwicklung Bannfeuer steht zur Wahl' },
      { icon: 'opfer', wert: '1 je Saison', text: 'Das Feuer verlangt in jeder Saison ein Opfer aus dem Volk' },
      { icon: 'zustimmung', wert: '−1?', text: 'Die Furcht im Volk wächst und die Zustimmung kann sinken' }
    ],
    folgenVeto: [
      { icon: 'praxis', wert: 'alte Lehre', text: 'Das Volk bleibt bei der alten Lehre der Flamme' },
      { icon: 'rat', wert: 'Torhild −2', text: 'Torhild verliert Vertrauen in die Führung' },
      { icon: 'dauer', wert: 'Frühling', text: 'Die Frage kehrt frühestens im Frühling zurück' }
    ],
    vetoKosten: [{ key: 'zustimmung', menge: -1 }]
  },

  rivalen: [
    {
      id: 'schaedelklan',
      name: 'Schädelklan',
      beschreibung: 'Reiterbünde aus dem Osten, die Pässe sperren und Herden rauben.',
      haltung: 'feindlich',
      anfuehrer: { id: 'skarn', name: 'Skarn Knochenhand', rolle: 'Klanführer' },
      lager: { dq: 9, dr: -6 },
      bestimmung: {
        name: null,
        bekannt: false,
        meilensteine: [
          { text: 'Den Grauhang plündern', erreicht: true },
          { text: null, erreicht: null },
          { text: null, erreicht: null },
          { text: null, erreicht: null }
        ]
      }
    },
    {
      id: 'talbund',
      name: 'Talbund',
      beschreibung: 'Ein Handelsbund der Talstädte, der Salz und Wolle über die Pässe führt.',
      haltung: 'wachsam',
      anfuehrer: { id: 'veleda', name: 'Veleda von Wiesenfurt', rolle: 'Bundesmeisterin' },
      lager: { dq: -8, dr: 6 },
      bestimmung: {
        name: 'Herr der Pässe',
        bekannt: true,
        meilensteine: [
          { text: 'Eine Salzstraße über den Hohlpass eröffnen', erreicht: true },
          { text: 'Zoll an drei Pässen erheben', erreicht: true },
          { text: 'Jeden Sommer zwei Karawanen über den Kamm führen', erreicht: false }
        ]
      }
    }
  ],

  entwicklungen: {
    // Practices: what the people does. Developments grow from them; the
    // "weil" of a proposal is the edge from its practice.
    praxis: [
      { id: 'p_schmiede', name: 'Schmiede am Roten Hang', von: 'volk' },
      { id: 'p_schwefel', name: 'Schwefel aus der Klamm', von: 'p_schmiede' },
      { id: 'p_salzlake', name: 'Fleisch in Salzlake', von: 'filzjurten' },
      { id: 'p_nebel', name: 'Späher im Nebel', von: 'pfadzeichen' },
      { id: 'p_hirten', name: 'Hirten wehren Überfälle ab', von: 'herdenrecht' },
      { id: 'p_nischen', name: 'Herden in Felsnischen', von: 'herdenrecht' },
      { id: 'p_wache', name: 'Wache am Hohlpass', von: 'bergbogen' },
      { id: 'p_gaben', name: 'Gaben in die Flamme', von: 'feuerlieder' }
    ],
    bekannt: [
      { id: 'filzjurten', von: 'volk', kurz: { icon: 'material', wert: '−1' }, name: 'Filzjurten', art: 'bauwerk', wirkung: 'Ein Lagerwechsel kostet 1 Holz weniger.' },
      { id: 'pfadzeichen', von: 'volk', kurz: { icon: 'spaeher', wert: '+1' }, name: 'Pfadzeichen', art: 'technik', wirkung: 'Späher erkunden mit +1.' },
      { id: 'herdenrecht', von: 'volk', kurz: { icon: 'zustimmung', wert: '+1' }, name: 'Herdenrecht', art: 'institution', wirkung: 'Streit um Weiden schlichtet der Rat der Herden.' },
      { id: 'bergbogen', von: 'volk', kurz: { icon: 'schild', wert: '+1' }, name: 'Bergbogen', art: 'einheit', wirkung: 'Krieger auf der Höhe treffen besser.' },
      { id: 'feuerlieder', von: 'volk', kurz: { icon: 'volk', wert: '+1' }, name: 'Feuerlieder', art: 'magie', wirkung: 'Die Feuerhüterin wärmt das Winterlager.' }
    ],
    forschung: [
      {
        id: 'schmelzofen', von: 'p_schmiede', kurz: { icon: 'erz', wert: '+1' },
        name: 'Schmelzofen am Hang',
        art: 'bauwerk',
        wirkung: 'Erz +1 je Saison.',
        fortschritt: 1,
        dauer: 3,
        weil: 'die Schmiede Erz am Hang ohne Wasserkraft verhütten'
      },
      {
        id: 'salzbeize', von: 'p_salzlake', kurz: { icon: 'nahrung', wert: '+1' },
        name: 'Salzbeize',
        art: 'technik',
        wirkung: 'Der Wintervorrat hält länger.',
        fortschritt: 2,
        dauer: 3,
        weil: 'die Frauen Fleisch seit zwei Wintern in Salzlake legen'
      }
    ],
    vorschlaege: [
      {
        id: 'pulverwall', von: 'p_wache', weilVon: 'p_schwefel', kurz: { icon: 'schild', wert: '+2' },
        name: 'Pulverwall',
        art: 'technik',
        wirkung: 'Verteidigung am Pass +2',
        kosten: [{ key: 'material', menge: 4 }, { key: 'erz', menge: 3 }, { key: 'wissen', menge: 2 }],
        preis: 'Die Pulverfässer sind gefährlich, und der Schwefelgeruch liegt dauerhaft über dem Lager.',
        weil: 'die Schmiede seit zwei Wintern Schwefel aus der Klamm sammeln',
        dauer: 3,
        herkunft: 'Forschungsagent',
        stimmung: { pro: ['brandur', 'ulrun'], contra: ['torhild'] }
      },
      {
        id: 'bannfeuer', von: 'p_wache', weilVon: 'p_gaben', kurz: { icon: 'schild', wert: '+2' },
        name: 'Bannfeuer',
        art: 'magie',
        wirkung: 'Verteidigung am Pass +2',
        kosten: [{ key: 'volk', menge: 1 }, { key: 'zustimmung', menge: 1 }],
        preis: 'Das dunkle Feuer nährt sich von einem Menschen aus dem Volk, und die Furcht vor der Flamme wächst.',
        weil: 'die Feuerhüterin seit dem letzten Winter Gaben in die Flamme legt und sie dunkel brennt',
        dauer: 1,
        herkunft: 'Forschungsagent',
        stimmung: { pro: ['torhild', 'garmund'], contra: ['ulrun'] }
      },
      {
        id: 'hirtenwehr', von: 'p_hirten', kurz: { icon: 'krieger', wert: '2' },
        name: 'Hirtenwehr',
        art: 'einheit',
        wirkung: 'Hirten schützen die Herden und kämpfen als Krieger der Stufe 2.',
        kosten: [{ key: 'nahrung', menge: 2 }, { key: 'material', menge: 1 }],
        preis: 'Jeder Trupp bindet Hirten, die sonst die Herde treiben.',
        weil: 'die Hirten bei Überfällen Stöcke und Schleudern zu Waffen gemacht haben',
        dauer: 2,
        herkunft: 'Forschungsagent',
        stimmung: { pro: ['ulrun', 'garmund'], contra: ['torhild'] }
      }
    ]
  },

  einheiten: [
    {
      id: 'lager_grauhang',
      name: 'Winterlager am Grauhang',
      art: 'lager',
      volk: 'spieler',
      pos: { dq: 0, dr: 0 },
      staerke: 4,
      zustand: 'Jurten stehen, Vorrat knapp'
    },
    {
      id: 'spaeher_nebel',
      name: 'Späherschar Nebelpfad',
      art: 'spaeher',
      volk: 'spieler',
      pos: { dq: 2, dr: -3 },
      staerke: 2,
      zustand: 'Ausgeruht, kennt die Nordpfade'
    },
    {
      id: 'herde_ziegen',
      name: 'Herde am Weidenhang',
      art: 'herde',
      volk: 'spieler',
      pos: { dq: -2, dr: 1 },
      staerke: 3,
      zustand: 'Gut genährt, Winterfell wächst'
    },
    {
      id: 'krieger_wacht',
      name: 'Wache vom Grauhang',
      art: 'krieger',
      volk: 'spieler',
      pos: { dq: 3, dr: -1 },
      staerke: 2,
      zustand: 'Wachsam, hält den Weg zum Pass'
    },
    {
      id: 'raeuber_joch',
      name: 'Plünderschar vom Schwarzen Joch',
      art: 'raeuber',
      volk: 'schaedelklan',
      pos: { dq: 6, dr: -5 },
      staerke: 3,
      zustand: 'Lagert nahe dem Pass, Pferde ausgeruht'
    },
    {
      id: 'raeuber_reiter',
      name: 'Schädelreiter',
      art: 'raeuber',
      volk: 'schaedelklan',
      pos: { dq: -3, dr: -3 },
      staerke: 2,
      zustand: 'Streift durch die Nordhänge'
    },
    {
      id: 'karawane_talbund',
      name: 'Salzkarawane aus Wiesenfurt',
      art: 'haendler',
      volk: 'talbund',
      pos: { dq: -5, dr: 4 },
      staerke: 1,
      zustand: 'Lastet schwer mit Salz'
    }
  ],

  orte: [
    {
      id: 'ort_hohlpass',
      name: 'Hohlpass',
      art: 'pass',
      pos: { dq: 4, dr: -3 },
      beschreibung: 'Der einzige breite Weg über den Kamm, auf dem Karawanen und Reiter ziehen.'
    },
    {
      id: 'ort_erzader',
      name: 'Erzader am Roten Hang',
      art: 'erzader',
      pos: { dq: -4, dr: 1 },
      beschreibung: 'Rotes Gestein mit Eisenadern, die die Schmiede seit zwei Jahren ausbeuten.',
      volk: 'spieler'
    },
    {
      id: 'ort_schrein',
      name: 'Schrein der Schauenden',
      art: 'schrein',
      pos: { dq: 1, dr: 4 },
      beschreibung: 'Ein Kreis aus Steinen, an dem die Schauenden Zeichen im Rauch lesen.',
      volk: 'spieler'
    },
    {
      id: 'ort_talmarkt',
      name: 'Wiesenfurt',
      art: 'siedlung',
      pos: { dq: -6, dr: 5 },
      beschreibung: 'Marktstadt des Talbunds, in der Salz, Wolle und Zoll gehandelt werden.',
      volk: 'talbund'
    },
    {
      id: 'ort_schwefelklamm',
      name: 'Schwefelklamm',
      art: 'hoehle',
      pos: { dq: -1, dr: -4 },
      beschreibung: 'Eine enge Schlucht, aus der gelber Dampf steigt und Schwefel gesammelt wird.'
    },
    {
      id: 'ort_warme_quelle',
      name: 'Warme Quelle',
      art: 'quelle',
      pos: { dq: -3, dr: -1 },
      beschreibung: 'Eine Quelle, die auch im Winter nicht gefriert.'
    },
    {
      id: 'ort_wachturm',
      name: 'Verfallener Wachturm',
      art: 'turm',
      pos: { dq: 5, dr: 1 },
      beschreibung: 'Ein halb eingestürzter Turm, von dem man das Vorland weit überblickt.'
    },
    {
      id: 'ort_knochenhoehle',
      name: 'Knochenhöhle',
      art: 'hoehle',
      pos: { dq: 7, dr: -2 },
      beschreibung: 'Eine Höhle mit Schädelzeichen an den Wänden, in der die Reiter des Klans rasten.',
      volk: 'schaedelklan'
    }
  ],

  // Roads and paths between objects; the map routes them over the terrain.
  wege: [
    { von: 'lager_grauhang', nach: 'ort_hohlpass', art: 'strasse' },
    { von: 'lager_grauhang', nach: 'ort_talmarkt', art: 'strasse' },
    { von: 'ort_erzader', nach: 'ort_talmarkt', art: 'pfad' },
    { von: 'lager_grauhang', nach: 'ort_erzader', art: 'pfad' },
    { von: 'lager_grauhang', nach: 'ort_schwefelklamm', art: 'pfad' },
    { von: 'lager_grauhang', nach: 'ort_schrein', art: 'pfad' },
    { von: 'ort_hohlpass', nach: 'ort_knochenhoehle', art: 'pfad' }
  ],

  handel: [
    { von: 'karawane_talbund', nach: 'ort_talmarkt', gut: 'Wolle' },
    { von: 'ort_talmarkt', nach: 'ort_hohlpass', gut: 'Salz' },
    { von: 'ort_erzader', nach: 'ort_talmarkt', gut: 'Erz' }
  ],

  befehle: [
    {
      id: 'befehl_nordpfad',
      titel: 'Nordpfad erkunden',
      ziel: 'Späherschar Nebelpfad',
      kosten: [{ key: 'nahrung', menge: 1 }],
      art: 'haupt'
    },
    {
      id: 'befehl_vorrat',
      titel: 'Wintervorrat anlegen',
      ziel: 'Winterlager am Grauhang',
      kosten: [{ key: 'material', menge: 2 }],
      art: 'neben'
    }
  ],

  meldungen: [
    {
      id: 'meldung_nahrung',
      art: 'warnung',
      titel: 'Nahrung knapp',
      text: 'Die Vorräte reichen nach der Rechnung der Hirten nicht über den ganzen Winter.',
      aktion: 'Ansehen'
    },
    {
      id: 'meldung_spaeher',
      art: 'warnung',
      titel: 'Späher am Pass',
      text: 'Reiter des Schädelklans lagern nahe dem Hohlpass und beobachten die Wege.',
      pos: { dq: 6, dr: -5 },
      aktion: 'Ansehen'
    },
    {
      id: 'meldung_salz',
      art: 'angebot',
      titel: 'Salz gegen Wolle',
      text: 'Die Karawane aus Wiesenfurt bietet Salz für den Winter und verlangt dafür Wolle.',
      pos: { dq: -5, dr: 4 },
      aktion: 'Verhandeln'
    },
    {
      id: 'meldung_rat',
      art: 'angebot',
      titel: 'Der Rat wartet',
      text: 'Der Rat bittet um Entscheidung über die Lehre des Bannfeuers.',
      aktion: 'Beraten'
    }
  ],

  befehlskatalog: {
    lager: [
      {
        id: 'lager_pferch',
        titel: 'Pferch bauen',
        kosten: [{ key: 'material', menge: 4 }, { key: 'herden', menge: 1 }],
        art: 'haupt',
        folge: 'Die Herde überwintert sicherer und verliert weniger Tiere.'
      },
      {
        id: 'lager_weiterziehen',
        titel: 'Weiterziehen',
        kosten: [{ key: 'nahrung', menge: 1 }],
        art: 'haupt',
        folge: 'Das Lager wird abgebaut und zieht zu einem neuen Platz.'
      },
      {
        id: 'lager_vorrat',
        titel: 'Wintervorrat anlegen',
        kosten: [{ key: 'material', menge: 2 }],
        art: 'neben',
        folge: 'Ein Teil der Nahrung wird für den Winter eingelagert.'
      },
      {
        id: 'lager_rat',
        titel: 'Rat einberufen',
        kosten: [],
        art: 'frei',
        folge: 'Die Ratsfrage wird neu aufgerufen.'
      }
    ],
    spaeher: [
      {
        id: 'spaeher_erkunden',
        titel: 'Erkunden',
        kosten: [{ key: 'nahrung', menge: 1 }],
        art: 'haupt',
        probe: {
          ziel: 5,
          modifikatoren: [
            { wert: 1, grund: 'kennt die Pfade' },
            { wert: -1, grund: 'Herbstnebel' }
          ],
          optional: [
            { wert: 1, grund: 'Garmund führt die Schar', kosten: [{ key: 'nahrung', menge: 1 }] },
            { wert: 1, grund: 'Pfadzeichen setzen', kosten: [{ key: 'material', menge: 1 }] }
          ]
        },
        folge: 'Das Gelände in der Umgebung wird aufgedeckt.'
      },
      {
        id: 'spaeher_zurueck',
        titel: 'Zurückrufen',
        kosten: [],
        art: 'frei',
        folge: 'Die Späher kehren ins Lager zurück.'
      }
    ],
    herde: [
      {
        id: 'herde_hochweide',
        titel: 'Auf die Hochweide treiben',
        kosten: [],
        art: 'neben',
        folge: 'Die Herde frisst besser, doch der Weg ist weit vom Lager.'
      },
      {
        id: 'herde_schlachten',
        titel: 'Tiere für den Vorrat schlachten',
        kosten: [],
        art: 'haupt',
        folge: 'Nahrung steigt um 3, die Herde wird kleiner.'
      },
      {
        id: 'herde_weidewechsel',
        titel: 'Weide wechseln',
        kosten: [{ key: 'nahrung', menge: 1 }],
        art: 'haupt',
        folge: 'Die Herde zieht zu einem frischen Weideplatz.'
      }
    ],
    krieger: [
      {
        id: 'krieger_pass',
        titel: 'Pass sichern',
        kosten: [{ key: 'nahrung', menge: 1 }],
        art: 'haupt',
        probe: {
          ziel: 5,
          modifikatoren: [{ wert: 1, grund: 'Höhenvorteil' }]
        },
        folge: 'Die Wache hält den Hohlpass und hindert Späher am Durchzug.'
      },
      {
        id: 'krieger_patrouille',
        titel: 'Patrouille',
        kosten: [],
        art: 'neben',
        folge: 'Die Wache sichert das Umland des Lagers.'
      },
      {
        id: 'krieger_zurueck',
        titel: 'Zurückrufen',
        kosten: [],
        art: 'frei',
        folge: 'Die Wache kehrt ins Lager zurück.'
      }
    ],
    feld: [
      {
        id: 'feld_erkunden',
        titel: 'Erkunden',
        kosten: [{ key: 'nahrung', menge: 1 }],
        art: 'haupt',
        probe: {
          ziel: 5,
          modifikatoren: [{ wert: -1, grund: 'Herbstnebel' }]
        },
        folge: 'Das Feld und seine Umgebung werden aufgedeckt.'
      },
      {
        id: 'feld_lager',
        titel: 'Lager hierher verlegen',
        kosten: [{ key: 'nahrung', menge: 2 }],
        art: 'haupt',
        folge: 'Das Hauptlager zieht auf dieses Feld.'
      }
    ],
    handel: [
      {
        id: 'handel_salz',
        titel: 'Salz gegen Wolle tauschen',
        kosten: [{ key: 'herden', menge: 1 }],
        art: 'neben',
        gibt: { key: 'salz', menge: 3 },
        folge: 'Drei Lasten Salz für den Winter, die Herde gibt dafür Wolle.'
      }
    ],
    fremd: [
      {
        id: 'fremd_unterhaendler',
        titel: 'Unterhändler senden',
        kosten: [{ key: 'wissen', menge: 1 }],
        art: 'haupt',
        probe: {
          ziel: 6,
          modifikatoren: [{ wert: -1, grund: 'Misstrauen zwischen den Völkern' }]
        },
        folge: 'Bei Erfolg zeigt die Haltung der Fremden eine Öffnung.'
      },
      {
        id: 'fremd_beobachten',
        titel: 'Beobachten',
        kosten: [],
        art: 'neben',
        folge: 'Die Wache meldet jede Bewegung der Fremden.'
      }
    ],
    ort: [
      {
        id: 'ort_untersuchen',
        titel: 'Untersuchen',
        kosten: [{ key: 'nahrung', menge: 1 }],
        art: 'haupt',
        probe: {
          ziel: 6,
          modifikatoren: [
            { wert: 1, grund: 'Pfadzeichen in der Nähe' },
            { wert: -1, grund: 'unbekanntes Gelände' }
          ]
        },
        folge: 'Der Ort gibt sein Wissen preis oder zeigt eine Gefahr.'
      },
      {
        id: 'ort_pfad',
        titel: 'Pfad markieren',
        kosten: [{ key: 'material', menge: 1 }],
        art: 'neben',
        folge: 'Ein Pfadzeichen führt künftig sicher zu diesem Ort.'
      }
    ]
  },

  chronik: [
    {
      saison: 'Frühling',
      jahr: 2,
      titel: 'Der Aufbruch vom Grauhang',
      text: 'Als der Schnee von den Kämmen wich, brach das Hochvolk mit allen Herden zu den oberen Weiden auf. Die Ältesten der Herden führten den Zug an. Am Grauhang schlugen die Hirten die Filzjurten auf und markierten die ersten Pfade. Es war ein ruhiges Frühjahr, doch die Späher sahen schon damals Rauch im Osten.'
    },
    {
      saison: 'Winter',
      jahr: 2,
      titel: 'Der Winter ohne Hunger',
      text: 'Der Schnee fiel früh und lag lange auf den Pässen. Die Vorräte reichten, weil die Frauen das Fleisch in Salz gelegt hatten. Niemand im Volk starb vor Hunger, und die Feuerhüterin sang jeden Abend am Herdfeuer. Die Alten sagten, es sei der erste gute Winter seit langer Zeit gewesen.'
    },
    {
      saison: 'Frühling',
      jahr: 3,
      titel: 'Der Überfall auf den Grauhang',
      text: 'Reiter des Schädelklans fielen im Frühling über die unteren Weiden her. Sie trieben zwanzig Ziegen fort und verbrannten zwei Jurten. Die Wache vom Grauhang kam zu spät, um sie zu halten. Seither mied das Volk die offenen Hänge und sicherte den Weg zum Pass.'
    },
    {
      saison: 'Sommer',
      jahr: 3,
      titel: 'Die Salzkarawane',
      text: 'Im Sommer erschien zum ersten Mal eine Karawane des Talbunds am Fuß des Hohlpasses. Die Händler tauschten Salz gegen Wolle und fragten nach dem Weg über den Kamm. Der Pfadmeister misstraute ihnen, doch die Hirten sahen den Nutzen. Am Ende des Sommers hatte der Rat zwei neue Pfadzeichen gesetzt, die auch den Händlern den Weg wiesen.'
    }
  ]
};
