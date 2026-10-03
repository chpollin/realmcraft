// Prototyp-Fixture für den Zwischenzug des Spielbretts. Der echte Regelkern ersetzt diese Abfolge später.
// Alle Positionen sind axiale Offsets zum Hauptlager und passen zu spielstand.js.

export const ZWISCHENZUG = {
  dauer: 9000,

  agenten: [
    { id: 'kern', name: 'Regelkern', rolle: 'Wertet Befehle und Würfe aus' },
    { id: 'welt', name: 'Weltagent', rolle: 'Löst Ereignisse in der Landschaft aus' },
    { id: 'rivalen', name: 'Rivalenvölker', rolle: 'Führt die Züge der anderen Völker' },
    { id: 'forschung', name: 'Forschung', rolle: 'Schlägt Entwicklungen aus der Praxis vor' },
    { id: 'rat', name: 'Rat', rolle: 'Wägt Loyalität und Stimmung der Berater' },
    { id: 'chronist', name: 'Chronist', rolle: 'Schreibt die Saison nieder' }
  ],

  ereignisse: [
    { t: 0, agent: 'kern', typ: 'phase', phase: 'A', titel: 'Regelkern und Weltereignisse, Befehle sind gesperrt' },
    { t: 0, agent: 'kern', typ: 'start', taetigkeit: 'wertet die Befehle der Saison aus' },
    { t: 200, agent: 'welt', typ: 'start', taetigkeit: 'würfelt Weltereignisse und prüft das Ereignisbudget' },
    { t: 400, agent: 'rivalen', typ: 'start', taetigkeit: 'lässt Schädelklan und Talbund ihre Züge machen' },

    { t: 900, agent: 'kern', typ: 'ressource', key: 'nahrung', delta: -2, grund: 'Der Herbstzug verbrauchte mehr, als die Hirten heimbrachten.' },
    { t: 1000, agent: 'kern', typ: 'ressource', key: 'material', delta: 1, grund: 'Die Holzfäller füllten das Lager vor dem Frost.' },
    {
      t: 1100,
      agent: 'kern',
      typ: 'ergebnis',
      titel: 'Befehle ausgeführt',
      text: 'Die Späher zogen nach Norden und der Wintervorrat wurde angelegt.',
      urteil: { status: 'angenommen', budget: '2 von 2' },
      karte: { art: 'aufgedeckt', pos: { dq: 3, dr: -4 }, radius: 2 }
    },

    { t: 1200, agent: 'forschung', typ: 'start', taetigkeit: 'liest die Praxis des Volkes und sucht neue Entwicklungen' },

    {
      t: 1300,
      agent: 'welt',
      typ: 'ergebnis',
      titel: 'Frost über den Südhängen',
      text: 'Ein früher Frost legt sich auf die Weiden westlich des Lagers.',
      urteil: { status: 'angenommen', budget: '2 von 3' },
      karte: { art: 'frost', pos: { dq: -4, dr: 3 } }
    },
    {
      t: 1500,
      agent: 'welt',
      typ: 'ergebnis',
      titel: 'Ruine entdeckt',
      text: 'Die Späher fanden im Norden eine verfallene Halle mit blauem Pulver in den Schalen.',
      urteil: { status: 'angenommen', budget: '3 von 3' },
      karte: {
        art: 'ort-neu',
        ort: {
          id: 'ort_ruine_stille_halle',
          name: 'Ruine der Stillen Halle',
          art: 'ruine',
          pos: { dq: 3, dr: -5 },
          beschreibung: 'Zerbrochene Stufen führen in einen Saal, in dem ein blaues Pulver in Schalen liegt.'
        }
      }
    },
    {
      t: 1600,
      agent: 'rivalen',
      typ: 'ergebnis',
      titel: 'Schädelklan rückt vor',
      text: 'Die Plünderschar vom Schwarzen Joch zieht näher an den Hohlpass heran.',
      urteil: { status: 'angenommen', budget: '1 von 2' },
      karte: { art: 'bewegung', einheit: 'raeuber_joch', nach: { dq: 5, dr: -4 } }
    },
    { t: 1800, agent: 'welt', typ: 'modul', key: 'psil' },
    {
      t: 1900,
      agent: 'welt',
      typ: 'ergebnis',
      titel: 'Lawine verschüttet den Talbund-Pass',
      text: 'Eine Lawine sollte den Weg der Händler nach Osten sperren.',
      urteil: { status: 'abgelehnt', grund: 'Ereignisbudget der Saison erschöpft' }
    },
    {
      t: 2000,
      agent: 'rivalen',
      typ: 'ergebnis',
      titel: 'Talbund erhöht den Salzpreis',
      text: 'Die Händler verlangen mehr Wolle für dieselbe Menge Salz.',
      urteil: { status: 'angenommen', budget: '2 von 2' }
    },
    { t: 2200, agent: 'kern', typ: 'ressource', key: 'zustimmung', delta: -1, grund: 'Das Volk fürchtet die Reiter nahe am Pass.' },
    { t: 2400, agent: 'rivalen', typ: 'ende' },
    { t: 2500, agent: 'kern', typ: 'meilenstein', volk: 'spieler', text: 'Fünf Pfadzeichen im Gebirge' },
    { t: 2600, agent: 'rat', typ: 'start', taetigkeit: 'wägt die Folgen der Saison für die Berater ab' },
    { t: 2800, agent: 'welt', typ: 'ende' },
    { t: 2900, agent: 'kern', typ: 'ende' },
    { t: 3000, agent: 'chronist', typ: 'start', taetigkeit: 'schreibt den Herbst nieder' },

    { t: 3200, agent: 'kern', typ: 'phase', phase: 'B', titel: 'Planung, Befehle sind wieder frei' },

    {
      t: 4200,
      agent: 'rat',
      typ: 'ergebnis',
      titel: 'Loyalitäten verschieben sich',
      text: 'Garmund gewinnt Vertrauen durch die Ruine, Ulrun sorgt sich um die Herden.',
      urteil: { status: 'angenommen', budget: '2 von 2' },
      loyalitaet: [
        { id: 'garmund', delta: 1, grund: 'Seine Späher fanden die Ruine.' },
        { id: 'ulrun', delta: -1, grund: 'Der Frost trifft die Weiden der Herde.' }
      ]
    },
    { t: 4800, agent: 'rat', typ: 'ende' },

    {
      t: 5000,
      agent: 'chronist',
      typ: 'chronik',
      saison: 'Herbst',
      jahr: 3,
      titel: 'Die Stille Halle',
      text: 'Im Herbst zogen die Späher nach Norden und fanden unter den Nebeln eine verfallene Halle. In den Schalen lag ein blaues Pulver, das die Schauenden Psil nannten. Zur selben Zeit legte sich früher Frost auf die Weiden im Westen, und die Hirten rechneten die Vorräte nach. Die Reiter des Schädelklans rückten näher an den Hohlpass heran. Der Rat blieb über das Bannfeuer uneins, doch das Volk setzte das fünfte Pfadzeichen und ging gestärkt in den Winter.'
    },

    {
      t: 5600,
      agent: 'forschung',
      typ: 'ergebnis',
      titel: 'Vorschlag Winterstall',
      text: 'Die Herden überwintern seit dem Frost in Felsnischen, daraus lässt sich ein Stall bauen.',
      urteil: { status: 'angenommen', budget: '1 von 2' },
      vorschlag: {
        id: 'winterstall',
        von: 'p_nischen',
        kurz: { icon: 'herden', wert: '+1' },
        name: 'Winterstall',
        art: 'bauwerk',
        wirkung: 'Die Herde verliert im Winter weniger Tiere.',
        kosten: [{ key: 'material', menge: 3 }, { key: 'erz', menge: 1 }],
        preis: 'Die Hirten müssen im Winter beim Stall bleiben und können nicht auf die Pfade.',
        weil: 'die Hirten die Herden seit dem Frost in Felsnischen treiben',
        dauer: 2,
        herkunft: 'Forschungsagent',
        stimmung: { pro: ['ulrun', 'brandur'], contra: ['garmund'] }
      }
    },
    {
      t: 6400,
      agent: 'forschung',
      typ: 'ergebnis',
      titel: 'Feuerdrache zähmen',
      text: 'Ein Vorschlag wollte die Flammen der Klamm in ein lebendes Wesen verwandeln.',
      urteil: { status: 'abgelehnt', grund: 'keine Grundlage in der Praxis des Volkes' }
    },
    { t: 8000, agent: 'forschung', typ: 'ende' },
    { t: 8800, agent: 'chronist', typ: 'ende' }
  ]
};
