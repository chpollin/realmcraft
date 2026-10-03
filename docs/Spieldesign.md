# Spieldesign

RealmCraft ist ein rundenbasiertes Strategiespiel im Browser, in dem ein Volk über Jahreszeiten hinweg eine eigene Entwicklung nimmt, während ein deterministischer Regelkern die Zahlen führt und Agenten Inhalte vorschlagen. Eine Runde ist eine Jahreszeit. Das Spiel ersetzt alle bisherigen Spiele des Repositorys, also die Spielleiterpartien im Chat, die Rundenprototypen Winter und Nachtmeer und den Echtzeitplan (D1 in [Entscheidungen.md](Entscheidungen.md)). Die bindenden Regeln stehen im [Regelkern](Regelkern.md), die Arbeitsteilung der Agenten im [Agentenvertrag](Agentenvertrag.md), die Umsetzung im [Plan](RealmCraft-Plan.md).

## Absicht

Die Absicht des Eigners verbindet Ziele, die sich gegenseitig bedingen:

1. Individuelle Entwicklung. Jedes Volk soll einen eigenen Weg gehen, der aus seinem Tun entsteht. Zwei Partien mit demselben Start sollen in unterschiedlichen Völkern enden.
2. Die Mechanik passt sich der Richtung an. Ein Volk, das Handel treibt, bekommt Handelsmechanik, eines, das Magie entdeckt, eine Magieökonomie. Die Regeln wachsen mit dem Volk, ohne dass jemand sie im Spiel erfindet.
3. Ein fairer Rahmen. Was ein Volk gewinnt, bezahlt es. KI-Völker spielen nach denselben Regeln, mit derselben Sicht und demselben Budget.
4. Ein Agenten-Harness. Sprachmodelle schlagen Entwicklungen, Ereignisse, Ratsstimmen, Rivalenzüge und Chronik vor. Der Kern prüft jeden Vorschlag und verrechnet ihn. Kein Agent setzt einen Wert.
5. Die Karte zuerst. Die Oberfläche ist eine wachsende Hex-Karte, auf der das Volk zieht, siedelt, erkundet und kämpft. Rat, Entwicklungen und Chronik sind Tafeln über der Karte.

### Folgen vor der Entscheidung sichtbar

Jede Entscheidung zeigt ihre Folgen dort, wo sie wirken, bevor sie festgelegt wird (D15). Das gilt für Befehle, Forschungswahl, Ratsabstimmung, Erlass und Probe. Neben den Ressourcen stehen die Veränderungen, am betroffenen Ratsmitglied die Loyalitätsänderung, auf der Karte die betroffenen Tiles, an der Probe die Erfolgswahrscheinlichkeit, die sich mit jeder Änderung neu berechnet. Diese Vorschau ist die Funktion `preview()` des Kerns, im Browser auf der Projektion des Spielers ausgeführt. Was die Oberfläche zeigt, ist deshalb genau das, was `apply()` tun wird, die Oberfläche schätzt nie selbst. Ausgenommen sind nur Ausgänge fremder Würfe, die die Vorschau als offen kennzeichnet. Der Eigner hat diese Unterstützung des Spielablaufs im Prototyp ausdrücklich hervorgehoben.

### Herkunft

Die Spielleiterpartien haben eine Entwicklungsmechanik bereits hervorgebracht, nur ungeregelt. Fast jede neue Fähigkeit, Disziplin oder Institution entstand dort aus einer natürlichen 10 oder einer gelungenen Machtprobe, und der Spielleiter setzte Wirkung und Preis frei. Das neue Spiel behält diese Erfahrung, dass Regeln im Spiel wachsen, und gibt ihr eine prüfbare Form.

## Ablauf einer Runde

Eine Runde durchläuft Planung, Auflösung und Agentenphase:

1. Planung. Der Spieler verteilt seine Sippen auf Tätigkeiten, wählt eine Hauptaktion und zwei Nebenaktionen, ein Forschungsziel und freie Handlungen wie Gespräche oder eine Machtprobe. Zu jeder Probe sieht er Ziel, jeden Modifikator mit Quelle und die Erfolgswahrscheinlichkeit, dann würfelt er 1d10 in der Oberfläche. Er würfelt auch das Weltereignis seines Volkes, dessen Band damit vor der Auflösung feststeht. Die Vorschau zeigt nach jeder Änderung Kosten, Erträge, Ratsstimmen und den erwarteten Stand nach der Runde.
2. Auflösung. Mit „Zug beenden" sind die Befehle gesperrt. Der Welt-Agent schreibt zu jedem Ereignisband eine passende Karte, der Validator prüft sie, dann löst der Kern die Saison in fester Reihenfolge auf (siehe [Regelkern, Abschnitt 14](Regelkern.md#14-phasen-und-reihenfolge-einer-saison)).
3. Agenten. Forschung, Rat, Rivalen und Chronist arbeiten parallel, während der Spieler schon die nächste Runde plant. Ihre geprüften Vorschläge erscheinen als neue Kandidaten, Ratsstimmen, Ereignisse im Pool und Chronik. Die Rivalen-Agenten liefern die Befehle der KI-Völker für die nächste Runde.

Jede Änderung trägt ihre Herkunft, ob Kern, Agent oder Spieler, mit Grund. Die Oberfläche zeigt zu jedem Wert, woher er kommt, und listet die Änderungen der Runde.

### Spielleitung, Zugarbeiter und Spielrichter

Die Spielleitung ist die Claude-Code-Hauptsitzung (D12, D14). Sie startet die Runde mit `/zug`, verteilt die Aufträge parallel, hält Überblick und Gesamterzählung, entscheidet Konflikte zwischen Vorschlägen und schwierige Fälle und gibt die Runde frei. Sie liest Zusammenfassungen und tut selbst wenig. Die Zugarbeiter laufen für Geschwindigkeit auf einem schnelleren Modell, Welt (`world`) als einziger blockierender Schritt, Rat (`council`), Rivalen (`rival`), Forschung (`research`) und Chronist (`chronicler`) parallel danach.

Nach der Runde arbeiten im Hintergrund die Spielrichter auf dem stärkeren Modell, ohne die Runde aufzuhalten. Der Kohärenzrichter (`judge-coherence`) prüft die Übereinstimmung mit Chronik, Welt und Figuren und findet Widersprüche, etwa ein geopfertes Ratsmitglied, das noch im Rat sitzt. Der Balancerichter (`judge-balance`) erkennt davonziehende Völker, auch KI-Völker, dominante Entwicklungspfade und Extremwerte der Ressourcen. Der Erzählrichter (`judge-narrative`) prüft seltener, etwa alle vier Runden oder beim Kapitelwechsel, Bogen, fallengelassene Fäden und den Sitz der Bestimmungen und verdichtet das Kampagnengedächtnis, damit es nicht driftet. Richter setzen keine Werte. Sie schreiben Befunde, die in der Tafel Weltgeschehen erscheinen, und dürfen Korrekturen als Vorschläge einreichen, die den Validator passieren müssen. Leichte Befunde fließen in die Aufträge der nächsten Runde. Nur schwere Befunde, also echte Regelwidersprüche, legt die Spielleitung dem Spieler vor der nächsten Runde vor.

## Volk und Rat

Ein Volk besteht aus Sippen, die zugleich Bevölkerung und Arbeitskraft sind. Jede Sippe arbeitet je Runde an einer Ressource, an Forschung, am Bau oder in einer Modultätigkeit wie dem Hüten. Was geerntet wird, begrenzen zugleich die zugewiesenen Sippen und das kontrollierte Land. Dieses Muster stammt aus den Arbeitsgruppen des Winter-Prototyps, wo Arbeit als Engpass Bauentscheidungen konkret machte.

Das Volk hat eine Wesensart aus einem Tag-Paar, +2 auf Proben, die zu ihm passen, −2 auf solche, die ihm widerstreben. Das Spielervolk sind Bergnomaden mit Stärke in Wegen und Wetter und Schwäche im Bleiben. Die beiden KI-Völker der Welt Hochland sind der Schädelklan, Reiterbünde, die Pässe sperren und Herden rauben, und der Talbund, ein Handelsbund der Talstädte.

Der Rat ist der politische Motor, wie er es in allen Spielleiterpartien war. Jedes Ratsmitglied hat ein Ziel mit Tags, die es fördert oder ablehnt, eine Loyalität von −5 bis +5, einen Lebensstand und ein Alter. Folgenreiche Befehle brauchen einen Ratsbeschluss. Die Stimmen rechnet der Kern aus dem Abgleich von Befehlstags und Zielen, der Rats-Agent gibt ihnen Worte. Der Spieler kann per Erlass gegen die Mehrheit handeln und zahlt mit Loyalität, oder er bricht Widerstand in einer Machtprobe. Ergebenheit verfällt, wenn ein Jahr lang kein Beschluss die Ziele eines Mitglieds bedient, damit der Rat nicht wie in mehreren Partien geschlossen bei +5 erstarrt. Mitglieder altern und sterben, die Nachfolge setzt Ansehen und Loyalität zurück.

## Entwicklung

Entwicklungen sind das generische Objekt, aus dem das Volk wächst. Eine Entwicklung ist eine Technik, Doktrin, Institution, Disziplin, Einheit, ein Bauwerk oder eine Lebensweise. Jede hat Wirkungen, einen dauerhaften Preis, einmalige Folgen beim Erwerb und Erwerbskosten. Wirkung und Preis bestehen ausschließlich aus Primitiven des [kanonischen Satzes](Regelkern.md#kanonischer-primitivsatz). Erzähltext beschreibt, wirkt aber nicht.

Der Baum ist nicht vorgegeben. Er wächst aus der Praxis des Volkes:

- Das Praxisbuch hält die Tags aller ausgeführten Befehle der letzten acht Runden. Seine drei stärksten Tags sind die Praxistags, also das, was das Volk tatsächlich tut.
- Der Forschungs-Agent schlägt nach einem Forschungsabschluss, nach einem politischen Anstoß oder auf Anfrage bis zu drei Kandidaten vor. Jeder muss in der Praxis, in einer Marke oder in einer Forschungsanfrage verankert sein und das Machtbudget seiner Stufe einhalten.
- Mit einer Forschungsanfrage gibt der Spieler seine eigene Richtung vor, ein bis drei Tags und einen Satz. Der Forschungs-Agent übersetzt sie in einen Kandidaten innerhalb des Budgets.
- Eine Hauptaktion kann als Wagnis erklärt werden. Sie wird schwerer oder überhaupt erst zur Probe. Eine natürliche 10 öffnet dann einen Durchbruch, eine Vorschlagsziehung der offenen Stufe zum Thema der Aktion, deren Ergebnis die Hälfte der Forschung kostet. Höchstens ein Durchbruch je Volk und Jahr, nie eine höhere Stufe, nie freie Macht. Das ist die geregelte Form der kritischen Coups, die in den Partien die eigentliche Forschungsmechanik waren.
- Eine Machtprobe mit Glücksfall oder deutlichem Erfolg gibt eine Marke `impulse`. Dieser politische Anstoß verankert eine Doktrin oder Institution, die Forschung (`research`) daraus vorschlägt. So entstanden in den Partien die Doktrinen aus Machtproben und die Ordnungen aus Ratsbeschlüssen.
- Ohne Agenten bietet der Kern Pool-Entwicklungen der Welt an, die zur Praxis passen.

Stufen und Tore halten das Wachstum im Rahmen. Eine Stufe öffnet sich für ein Volk erst, wenn es genug Entwicklungen der Stufe darunter kennt und groß genug ist, und für alle erst ab einem Weltalter. Forschung ist ein Fluss in ein Projekt ohne Wissensvorrat. Die Kosten steigen mit der Zahl bekannter Entwicklungen und sinken um ein Viertel, wenn ein Volk mit Kontakt die Entwicklung kennt. Diese Diffusion ist die einzige Aufholhilfe.

## Module

Ein Modul ist ein Mechanikblock im Code mit eigenem Zustand, eigenen Befehlen, eigenen Primitiven und eigener Tafel. Eine Entwicklung aktiviert es, und erst dann dürfen Agenten seine Tags und Befehle verwenden. So passt sich die Mechanik der gewählten Richtung an, ohne dass ein Agent Regeln erfindet. Neue Module schreiben Entwickler, nie Agenten (D10).

Der MVP umfasst diese Module (D11):

- Lebensweise, immer aktiv, nomadisch oder sesshaft. Nomaden ziehen mit Lager und Herden über Hochweiden und halten Land durch Weiderecht. Sesshafte bauen Dörfer, Felder und Mauern. Der Wechsel dauert zwei Runden und ist ratspflichtig.
- Handel, aktiviert durch eine Marktentwicklung. Verträge zwischen Völkern laufen über Routen durch die Regionen, ein Markt tauscht zu einem beweglichen Preis in der Währung Salz.
- Magie, aktiviert durch die erste Disziplin. Eine Disziplin hat eine Quelle an einem Ort, Anwendungen, die sie verbrauchen, eine drohende Abhängigkeit und einen Preis als Meter, der zu Schwellenereignissen führt. Das ist die Form, die sich in den Partien als stärkste generative Mechanik erwiesen hat.
- Militär, bewusst einfach. Einheiten mit Stärke und Unterhalt ziehen über Tiles, ein Gefecht ist eine Probe aus Stärkeverhältnis und Gelände. Die Partien liefern dafür wenig Evidenz, weil Kämpfe dort als einzelne Proben liefen. Das Modul wird nach der Balancesimulation verfeinert.

Weitere Module aus der Generalisierung der Partien folgen nach dem MVP, etwa Herrschaft mit Delegation und Verfassungswechsel, Glaube und Legitimität, Diplomatie, Oberherrschaft, Unfreiheit, Aufnahme fremder Gruppen und Bedrohungen wie das Finstere der Gestrandeten. Kombinationen aktiver Module sind der Ort, an dem sich Völker unterscheiden.

## Karte und Weltwachstum

Die Welt ist eine dynamisch erzeugte, wachsende Hex-Karte aus `engine/world` (D2). Sie entsteht aus einem Seed und den Generatorregeln der Welt in Chunks, sobald jemand in ihre Nähe kommt, und ist deshalb nie fertig gezeichnet. Tiles tragen Gelände, Bewegungskosten, Sicht und Bauplätze. Regionen fassen Tiles zusammen und sind die Einheit von Kontrolle, Ertrag und Besiedlung. Der Ertrag einer Region folgt aus den Grunderträgen ihrer Tiles, aus Merkmalen wie Lagerstätten und aus den Entwicklungen ihres Kontrolleurs.

Jedes Volk sieht nur, was es erkundet hat, und fremde Einheiten nur, wo es gerade hinsieht (D9). Der Welt-Agent darf am Rand des Bekannten neue Orte vorschlagen, Quellen, Ruinen, Schreine, wenn sie kein Volk schon kennt, weit genug von allen Siedlungen liegen und im Budget bleiben. So wächst die Welt mit dem Spiel, ohne einem Volk Geschenke vor die Tür zu legen.

## Proben und Zufall

Die Wirtschaft rechnet deterministisch, Ernte, Verbrauch, Unterhalt und Forschung ohne Würfel. Gewürfelt wird, wo der Ausgang offen ist, also bei Erkundung, Zug, Lebensweisewechsel, Machtprobe, Gefecht, Anwendungen von Disziplinen, Wagnissen und dem Weltereignis. Diese Trennung beantwortet die erste Grundsatzfrage vorläufig (siehe offene Fragen).

Eine Probe ist 1d10 plus Modifikatoren gegen ein Ziel von 3 bis 8. Der Spieler sieht vorher die Erfolgswahrscheinlichkeit `P = clamp((11 − Ziel + Mod) / 10, 0.1, 0.9)`. Eine 1 scheitert immer, eine 10 gelingt immer. Modifikatoren stapeln nur begrenzt, je Tag-Familie zählt der höchste Bonus und der tiefste Malus, die Summe bleibt in −4..+4, damit der Würfel nie bedeutungslos wird. Würfe wie „12 gegen 7" aus den Partien sind damit ausgeschlossen. Sechs Bänder von Glücksfall über Erfolg, Knapp, Fehlschlag und Rückschlag bis zum kritischen Fehlschlag stufen jedes Ergebnis.

Der Spieler würfelt selbst für sein Volk und sein Weltereignis. Alles übrige, auch die Angriffe der KI-Völker und die Lebenswürfe, zieht der Kern aus dem gespeicherten Zufallsgenerator. Ein Wurf ist an seine Probe gebunden. Ändert sich danach etwas an ihr, verfällt er sichtbar. Eine Rede gibt keinen Bonus mehr, weil Erzählung keinen Wert setzen darf.

## Bestimmung, Sieg und Untergang

Jedes Volk hat eine Bestimmung mit drei oder vier Meilensteinen (D6), etwa Weideplätze sichern, Winter ohne Hunger überstehen, eine Wintersiedlung mit Vorrat errichten. Jeder Meilenstein ist ein Prädikat, das der Kern prüfen kann, Kontrolle über Regionen oder Orte, ein Zustand über mehrere Saisons, ein Mindestwert, eine Beziehung oder eine Entwicklung einer Art und Stufe. Wer zuerst alle Meilensteine erreicht, gewinnt.

Ändert ein Volk seine Richtung, kann es eine neue Bestimmung annehmen. Forschung (`research`) schlägt dann Bestimmungen vor, die zur neuen Praxis passen, ohne Agenten kommen sie aus dem Weltpaket. Der Validator bewertet ihre Schwierigkeit mit derselben Budgetidee wie bei Entwicklungen, und die Annahme kostet Ansehen und die Loyalität derer, die an der alten hingen. Die Bestimmungen der Rivalen sind verborgen, bis Aufklärung sie aufdeckt.

Ein Volk geht unter, wenn es keine lebensfähige Siedlung mehr hat, wenn seine Bevölkerung unter den Kern fällt oder wenn alle seine Siedlungen erobert sind. Der MVP spielt den Modus Wettstreit. Die Offene Chronik ohne Sieg folgt später.

## Fairness und Schutz vor Wertdrift

Das Machtbudget ist der Kern der Fairness. Jedes Primitiv hat ein ganzzahliges Gewicht. Die Wirkung einer Entwicklung darf die Obergrenze ihrer Stufe nicht übersteigen, Wirkung und Preis ergeben einen Nettowert, der in der Spanne der Stufe liegen muss, ab Stufe 2 muss der Preis einen Mindestbetrag erreichen, und die Forschungskosten folgen aus Nettowert und Stufe. Ein Vorschlag kann damit weder Schnäppchen noch Totgewicht sein, und kein Agent kann eine zu starke Wirkung über hohe Forschungskosten rechtfertigen. Das entspricht der Formel der Grundmechanik, jede Stärke wird bezahlt, und der Wesensart, deren +2 an ein −2 gebunden ist. Gewichte und Stufentabelle stehen als einzige Quelle in `engine/schemas/effects.js`, die Formeln im [Regelkern, Abschnitt 10](Regelkern.md#10-validator-und-machtbudget).

KI-Völker teilen Zustandsform, Befehlskatalog, Vorschau, Validator, Budget, Vorschlagsrate und Sichtfilter mit dem Spieler. Ihre Agenten sehen nur die Projektion ihres Volkes. Jedes KI-Volk hat ein Profil aus gewichteten Interessen, damit nicht alle dieselbe beste Linie spielen. Ein Machtindex je Volk und Saison steht im Entwicklerprotokoll für die Balanceprüfung, nicht in der Spieloberfläche.

Gegen Wertdrift wirken mehrere Bremsen, jede mit einem Beleg aus den Partien:

| Bremse | Regel | Beleg |
|---|---|---|
| Lagergrenzen | Überschuss verliert je Runde die Hälfte | Vorräte weit über der Skala in den Karren und den Gestrandeten |
| Kein Wissensvorrat | Forschung fließt in ein Projekt, Rest verfällt | Wissen weit über der Skala in den Karren und den Gestrandeten |
| Unterhalt | Einheiten, Bauwerke ab Stufe 2 und Ordnungen kosten dauerhaft | Gilde der Wärme „will gespeist sein", stehendes Heer nie verbucht |
| Klemmen | Lagewerte −2..+3, Gewinne vor Verlusten gedeckelt | Zuversicht in Nachtmeer |
| Stapelgrenze | höchster Bonus je Tag-Familie, Summe ±4 | Würfe „12 gegen 7" und „11 gegen 5", fünf Modifikatoren im Thronsaal des Löwen |
| Höchstzahl stehender Ordnungen | zwei plus eine je drei Sippen, Ablösung über `replaces` | lange Listen stehender Setzungen in den Gestrandeten |
| Verfall der Ergebenheit | jährlich eine Stufe ohne bedientes Interesse | ganzer Rat bei +5 in den Gestrandeten und den Karren |
| Begrenzte Machtprobe | eine frei, eine zweite kostet die Hauptaktion | vier Machtproben in einer Saison der Wälle |
| Durchbruch statt Coup | höchstens einmal im Jahr, nie höhere Stufe | Coup-Hebel in allen Partien |
| Zahl schlägt Text | Erzählung trägt keine Werte | widersprüchliche Text- und Zahlwerte im Speicherstand des Löwen |

## Durchgerechneter Pfad

Der Pfad, den der Eigner als Prüffall genannt hat, führt ein Bergnomadenvolk über die feste Siedlung zu Handel und Befestigung und gabelt sich dann in Schwarzpulver, arkanes Feuer oder dunkle Magie. Er zeigt, dass Budget und Validator jeden dieser Wege zulassen, ohne dass einer billiger wird. Die Werte sind Entwurfswerte zum Prüfen des Modells, gerechnet mit den Startwerten in `engine/schemas/effects.js`. Der Validatorkorpus pinnt den Pfad als Fixture, eine Änderung der Startwerte zieht ihn dort und hier nach.

Ausgangslage sind drei Sippen, Nahrung an der Lagergrenze, wenig Stein, die Wesensart +2 auf Wege und Wetter, −2 auf Mauern und Bleiben, und die nomadische Lebensweise.

| Entwicklung | Art | Stufe | Kern der Wirkung | Kern des Preises |
|---|---|---|---|---|
| Saumpfade | technik | 1 | zwei Regionen aufgedeckt, +1 auf Erkundung | keiner |
| Die feste Siedlung | lebensweise | 1 | Verteidigung +1, Lagergrenze Nahrung +2, Dorf statt Lager | Mobilität −1 |
| Terrassenfelder | bauwerk | 1 | Nahrung +1 je zugewiesener Sippe außer im Winter | keiner |
| Markt am Pass | bauwerk | 2 | Wohlstand +1, Handel aktiviert, Handelsangebote | Meter Begehrlichkeit je Saison mit Verlust bei der Schwelle |
| Geleit- und Zollrecht | institution | 2 | Holz +1 je Saison, +1 auf Verhandlung, Ansehen | Geleitpflicht jedes Jahr, Beziehung zur Transitmacht −1 |
| Steinwall | bauwerk | 2 | Verteidigung +1, +1 gegen Überfälle | Stein −1 im Winter |
| Schwarzpulver | technik | 3 | Geschütztyp Stärke 3, +2 Verteidigung befestigt, +1 Belagerung, Verteidigung +1 | Pulvermühle Erz −1 je Saison, Beziehung zu den Nachbarn −1 |
| Bastion | bauwerk | 3 | +2 gegen Belagerung, −1 für Belagerer, Ausfall | erster Vorschlag laufender Unterhalt, überarbeitet Winterreparatur und Verbot, die Bastion im Winter zu räumen |
| Arkanes Feuer | disziplin | 3 | Feuerbinder Stärke 3 mit Unterhalt in Glut, Verteidigungsboni wie Schwarzpulver | Meter Verzehr der Adepten, Beziehung zu den Nachbarn −1, gebunden an den Glutschlot |
| Blutritus | disziplin | 2 | Opferhandlung erzeugt Essenz, Schreckensbild, Essenz zu Erkenntnis | Meter Furcht, Beziehung −1 |
| Schuldknechtschaft | institution | 2 | Raubzug, eine unfreie Sippe, +1 auf Bauen | Meter Aufruhr, Verbot der Bewaffnung Unfreier, Beziehung −1 |
| Der Schwarze Zirkel | institution | 3 | Zirkelmeister im Rat, Forschung +2 zweckgebunden, Furcht aus Opfern Unfreier aufgehoben, Seelenbrand | Ratsverlust ohne Opfer, Veto über die Abschaffung der Unfreiheit, Beziehung −1 |

Die Rechnung verwendet die Wirkung `E`, den Preis `P` (negativ) und den Nettowert `N = E + P`. Gültig ist eine Entwicklung, wenn `E` die Obergrenze ihrer Stufe nicht übersteigt, `N` in der Spanne der Stufe liegt und `P` den Mindestpreis erreicht. Die Forschung beträgt `N × (Stufe + 1)`.

| Entwicklung | Stufe | E | P | N | Forschung | Ergebnis |
|---|---|---|---|---|---|---|
| Saumpfade | 1 | 3 | 0 | 3 | 6 | gültig |
| Die feste Siedlung | 1 | 4 | −3 | 1 | 2 | gültig, Wechsel der Lebensweise |
| Terrassenfelder | 1 | 2 | 0 | 2 | 4 | gültig |
| Markt am Pass | 2 | 5 | −2 | 3 | 9 | gültig, aktiviert Handel |
| Geleit- und Zollrecht | 2 | 5 | −3 | 2 | 6 | gültig |
| Steinwall | 2 | 4 | −1 | 3 | 9 | gültig |
| Schwarzpulver | 3 | 9 | −5 | 4 | 16 | gültig |
| Bastion, erster Vorschlag | 3 | 5 | −3 | 2 | keine | abgelehnt, `budget_net` |
| Bastion, überarbeitet | 3 | 5 | −2 | 3 | 12 | gültig |
| Arkanes Feuer | 3 | 9 | −5 | 4 | 16 | gültig, aktiviert Magie |
| Blutritus | 2 | 6 | −4 | 2 | 6 | gültig, aktiviert Magie |
| Schuldknechtschaft | 2 | 6 | −4 | 2 | 6 | gültig, braucht Modul Unfreiheit |
| Der Schwarze Zirkel | 3 | 9 | −6 | 3 | 12 | gültig |

Die feste Siedlung zeigt, wie der Rat Politik ohne Zusatzregel erzeugt. Die Hirtenälteste, deren Ziel den Tag `nomadisch` fördert, stimmt gegen den Wechsel und verliert bei Beschluss einen Loyalitätspunkt, und die Wesensart wirkt mit −2 auf Bauproben, bis eine Doktrin sie umdeutet.

Mit Siedlung, Wall und Pulver erreicht die Verteidigung des Hauptorts +3 und damit die Klemme. Ein weiterer Vorschlag, dessen einzige Wirkung ein Verteidigungsbonus wäre, scheitert an `clamp_dead`. Die Bastion zeigt den Normalfall der Agentenschleife. Der erste Vorschlag trägt laufenden Unterhalt, sein Nettowert 2 liegt unter der Spanne der Stufe 3, und der Validator meldet `budget_net`. Der Forschungs-Agent ersetzt den Unterhalt durch Winterreparaturen und ein enges Verbot, die Bastion im Winter zu räumen. Damit ist `N = 3`, die Forschung 12. Mit nur einem Punkt Preis wäre der Vorschlag am Mindestpreis der Stufe 3 gescheitert.

Arkanes Feuer hat dasselbe Wirkungsgerüst, dieselbe Stufe und dieselbe Forschung wie Schwarzpulver. Unterschiedlich sind Tags, Quelle und Preisart. Pulver hängt an Schwefel aus einem Merkmal oder von einem Handelspartner und kostet laufend Erz, Feuer hängt an einem Ort und verbraucht Menschen. Dieselbe Rolle kann technisch oder magisch besetzt sein, ohne dass eine Variante billiger wird.

Der dunkle Pfad erreicht dieselbe Bruttowirkung früher und mit weniger Forschung, Blutritus und Schuldknechtschaft kosten je 6, der Markt 9, weil er mehr Preis trägt. Die Kopplung entsteht ohne Sonderregel. Der Zirkel macht Opfer an Unfreien furchtfrei, die Unfreiheit liefert die Opfer, jeder Raubzug treibt den Aufruhr, und der Zirkel hat ein Veto über die Abschaffung. Das bildet die Struktur aus dem Löwen, in dem das Feuer des Ashut die eigene Basis frisst, als Spielregel statt als Spielleiterentscheidung ab. Ob die Meter den Vorsprung einholen, muss die Balancesimulation zeigen. Die Schuldknechtschaft braucht das Modul Unfreiheit, das nicht zum MVP gehört (Frage 4 unten).

## Übernommen und verworfen

Übernommen aus den Partien und Prototypen:

| Mechanik | Beleg |
|---|---|
| Würfelkultur mit offenem Ziel, offenen Modifikatoren und Eigenwurf | jede Chronik erzählt den Wurf als Szene, die Marge im Thronsaal des Löwen bestimmte, wer entkam |
| Rat mit Eigenzielen und Loyalität | Motor aller Partien, unter dem Mehrheitsbescheid der Gestrandeten handelt jeder Berater gegen die Erste, wenn sein Ziel es verlangt |
| Disziplin mit Quelle, Anwendungen und Preis | stärkste generative Form der Partien, mehrere Disziplinen in den Gestrandeten und im Löwen |
| Wesensart als gebundenes Paar | trug in allen Partien Entscheidungen |
| Altern, Lebenswurf, Nachfolge | Lebenswürfe und Tod trugen Kapitel der Karren |
| Saisonwechsel mit genau einem Weltereignis | Tempo und Überraschung im Logbuch der Gestrandeten |
| Arbeitsgruppen als Engpass | Winter-Prototyp |
| Kosten aus dem Eröffnungsvorrat, Wirkung ab Folgerunde | Winter und Nachtmeer, verhindert, dass eine Mine ihre eigenen Kosten bezahlt |
| Ratsabstimmung mit sichtbaren Gründen, Veto und Erlass mit Preis | Winter und Nachtmeer |
| Bindende Institution, die auch die Führung bindet | Versorgungspakt in Winter, Gildenvertrag und Gemeingut in Nachtmeer |
| Reine Vorschau und Wiederaufbau durch erneutes Rechnen | beide Rundenprototypen |
| Regeln wachsen im Spiel | Setzungen aller Partien, jetzt als geprüfte Entwicklungen |

Verworfen:

| Mechanik | Grund |
|---|---|
| Chat-Spielleiter mit hybridem Markdown-Speicherstand | ersetzt durch Kern und Agenten (D1), Text und Zahl widersprachen sich im selben Stand |
| Freitext-Setzungen als Regelträger | bleiben als Erzähltext einer strukturierten Entwicklung |
| offener Bereich „darüber Überfluss" bei Grundgrößen | Ursache der Wertdrift |
| skalarer Wissensstand | vermischte Vorrat, Forschungsstand und Gedächtnis |
| unbegrenzte Machtproben | stärkste und kostenlose Handlung der Partien |
| Redebonus in der Machtprobe | wäre eine Erzählentscheidung über einen Wert |
| Trends als Schätzung | ersetzt durch berechnete Flüsse |
| freie Hand bei hohler Loyalität | ersetzt durch Probe und feste Verratsliste |
| echte Marktdaten und reale Zeit aus der Mehrung | machen Partien unreproduzierbar |
| Echtzeitlaufzeit | ersetzt durch Runden (D1) |
| ASCII-Statuskonsole | ersetzt durch die Karte als Oberfläche, der Grundsatz Klartext und vollständige Rechnung bleibt |
| Grundton und Chronisten-Stil als Regeln | werden Konfiguration des Chronisten je Welt |

## Offene Fragen an den Eigner

Die Grundsatzfragen aus der Generalisierung der Partien, mit ihrem Stand nach D1 bis D14:

1. Zufall. Vorläufig rechnet die Wirtschaft deterministisch, gewürfelt wird bei Erkundung, Zug, Wechsel der Lebensweise, Machtprobe, Gefecht, Anwendung, Wagnis und Weltereignis. Soll stattdessen jede Aktion gewürfelt werden wie in den Spielleiterpartien?
2. Maßstab. Vorläufig bleiben Modifikatoren, Lagewerte und Loyalität bei den kleinen Ganzzahlen der Partien, Vorräte liegen mit Lagergrenzen im niedrigen zweistelligen Bereich, die Bevölkerung zählt in Sippen. Trägt dieser Maßstab gebaute Einheiten und Handelsmengen, oder braucht es den feineren Maßstab der Prototypen?
3. Rat und Herrscherfigur. Vorläufig bleibt der Rat das politische Zentrum, die Leitung altert und stirbt. Soll der Rat hinter Volk, Einheiten und Karte zurücktreten, und soll die Spielerfigur unsterblich sein?
4. Dunkle Inhalte. Sollen Unfreiheit und Menschenopfer als spielbare Institutionen mit voller Mechanik erscheinen, und dürfen KI-Völker solche Pfade selbstständig wählen? Davon hängt ab, ob das Modul Unfreiheit nach dem MVP gebaut wird.
5. Spielende im Wettstreit. D6 legt Sieg über die Bestimmung fest. Offen ist, ob es ein Rundenlimit gibt, ob ein eingerasteter Meilenstein zählt, auch wenn sein Zustand später verloren geht (so vorläufig im Regelkern), und ob die wachsende Welt weitere Völker über Schädelklan und Talbund hinaus hervorbringen soll.
6. Volksstimmung. Der Spielbrett-Prototyp führt eine Zustimmung des Volkes als eigenen Wert, der Regelkern kennt nur Rat, Loyalität und Ansehen. Soll es einen Meter der Volksstimmung geben, und wenn ja, als Kernwert oder als Modul?

Die Frage nach der Erweiterbarkeit der Mechanik ist durch D10 entschieden, neue Module sind Codeänderungen der Entwicklung. Die offenen Punkte des Kernentwurfs sind durch D1 (Chat-Spielleiter entfällt), D9 (Spielerprojektion verbindlich) und D5 (Wurfzuständigkeit, Wegfall des Redebonus) entschieden.
