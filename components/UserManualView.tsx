
import React from 'react';

const UserManualView: React.FC = () => {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl p-8 md:p-12">
        
        {/* Header */}
        <div className="border-b-2 border-indigo-500 pb-6 mb-8">
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
            CHRONOS AI
          </h1>
          <p className="text-xl text-indigo-600 dark:text-indigo-400 font-medium">
            Manuale Utente v1.2
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Sistema Intelligente di Gestione Cantiere e Contabilità Lavori
          </p>
        </div>

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-8">
          
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">1</span>
              Introduzione
            </h2>
            <p className="leading-relaxed">
              Chronos AI non è un semplice cronoprogramma. È un <strong>ERP di Cantiere</strong> completo che sfrutta l'Intelligenza Artificiale (Gemini 3) per trasformare preventivi statici in piani di lavoro dinamici, monitorare l'avanzamento economico (SAL) e gestire le risorse umane.
              Questo manuale guida l'utente attraverso le fasi operative: dalla creazione del cantiere alla rendicontazione finale.
            </p>
          </section>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">2</span>
              Accesso e Portfolio (I Miei Cantieri)
            </h2>
            <p className="mb-4">All'avvio, dopo il login (o l'inserimento della chiave di licenza), si accede all'area <strong>Portfolio</strong>.</p>
            
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">2.1 Gestione Progetti</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Card Cantiere:</strong> Ogni progetto è rappresentato da una scheda unica con un logo generativo distintivo ("Brand di Cantiere"). La scheda mostra a colpo d'occhio Nome, Località, Valore Totale, SAL Maturato e Grafico di avanzamento.
              </li>
              <li>
                <strong>Nuovo Cantiere:</strong> Cliccare sul riquadro tratteggiato "Nuovo Cantiere" per iniziare.
              </li>
              <li>
                <strong>Archivio Storico:</strong> Usare le icone in alto a destra per passare dai "Cantieri in Corso" all' "Archivio". I progetti completati possono essere archiviati per pulire la vista, ma rimangono sempre consultabili e ripristinabili.
              </li>
              <li>
                <strong>Eliminazione Sicura:</strong> Cliccando sull'icona cestino (trascinamento o click), il sistema chiede conferma e offre la possibilità di scaricare un <strong>Backup di Sicurezza</strong> prima della cancellazione definitiva.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">3</span>
              Importazione e Analisi AI
            </h2>
            <p className="mb-4">Il cuore di Chronos AI è la capacità di leggere i documenti tecnici.</p>
            <ol className="list-decimal pl-6 space-y-2">
              <li><strong>Formati Supportati:</strong> PDF (es. Primus), JSON (file proprietari Chronos), Testo Semplice.</li>
              <li><strong>Analisi Gemini 3:</strong> Caricando un computo metrico, l'AI analizza le voci, raggruppa le lavorazioni (WBS), stima le durate basandosi sugli importi e genera automaticamente una prima bozza di Gantt.</li>
              <li><strong>Salvataggio:</strong> Ricordarsi di usare frequentemente "Salva con Nome" per generare il file <code>.json</code> che contiene l'intero stato del cantiere. Il sistema visualizza sempre la data e l'ora dell'ultimo salvataggio nell'intestazione.</li>
            </ol>
          </section>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">4</span>
              Pianificazione (Timeline Gantt)
            </h2>
            <p className="mb-4">La vista <strong>Timeline</strong> è la plancia di comando temporale.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Barre Attività:</strong> Trascinare la barra per spostare le date, o trascinare l'estremità destra per allungare la durata.</li>
              <li><strong>Dipendenze:</strong> Cliccare sui pallini alle estremità delle barre per collegare due attività.</li>
              <li><strong>Linea SAL (Rossa):</strong> Una linea verticale rossa indica la data di taglio del SAL. Spostandola, il sistema calcola il "Maturato Teorico" e il "Maturato Reale".</li>
              <li><strong>Vista Spese:</strong> Attivando il pulsante "Spese", sulla timeline compaiono icone che rappresentano acquisti o forniture (icona "Camioncino").</li>
            </ul>
          </section>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">5</span>
              Contabilità e Misurazioni (Il Cuore Operativo)
            </h2>
            <p className="mb-4">Facendo doppio click su una barra del Gantt, si apre la <strong>Scheda Attività</strong>.</p>
            
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">5.1 Inserimento Misure</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li>Selezionare <strong>Data</strong>, <strong>Squadra</strong> e <strong>Operai</strong>.</li>
                        <li>Usare il pulsante <strong>START</strong> se l'attività non è iniziata.</li>
                        <li>Il sistema suggerisce la quantità residua in grigio.</li>
                        <li>Usare le frecce per incrementare del 10% o digitare manualmente.</li>
                        <li>Cliccare <strong>(+)</strong> per registrare.</li>
                    </ul>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">5.2 Rettifiche e Storni</h3>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                        <li><strong>Elimina (Cestino):</strong> Solo per misure appena inserite (correzione errori immediati).</li>
                        <li><strong>Storno (Freccia Indietro):</strong> Per le misure salvate. Crea una nuova riga uguale e contraria (segno meno) in rosso, con dicitura "STORNO".</li>
                        <li><em>Garantisce tracciabilità fiscale e contabile.</em></li>
                    </ul>
                </div>
            </div>
          </section>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">6</span>
              Gestione Risorse Umane (HR)
            </h2>
            <p>Accessibile dal menu laterale "Squadre & Operai".</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
                <li><strong>Database Globale:</strong> Le risorse sono salvate in una "memoria aziendale" condivisa tra i cantieri.</li>
                <li><strong>Creazione:</strong> Definire Squadre (con colore) e assegnare Operai con Ruoli specifici.</li>
                <li><strong>Monitoraggio:</strong> Nel brogliaccio, ogni produzione è taggata con la squadra, permettendo analisi di produttività.</li>
            </ul>
          </section>

          <hr className="border-gray-200 dark:border-gray-700" />

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 w-8 h-8 rounded-full flex items-center justify-center text-sm mr-3">7</span>
              Contabilità Avanzata e SAL
            </h2>
            
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Filosofia del Dato Analitico (Fondamentale!)</h3>
                    <p className="text-sm bg-blue-50 dark:bg-blue-900/30 p-3 rounded border-l-4 border-blue-500">
                        Chronos AI adotta un approccio rigoroso: <strong>anche per i lavori "A Corpo", la misura deve essere analitica.</strong>
                        Perché? Perché solo inserendo le misure (metri, pezzi, kg) il sistema può calcolare l'esatta incidenza della manodopera per ogni singola voce.
                    </p>
                    <p className="text-sm mt-2">
                        Se attivata l'opzione <strong>"Scorpora Costo Manodopera"</strong> nelle Impostazioni, il sistema esegue questo calcolo nel SAL:
                        <ol className="list-decimal pl-5 mt-1 space-y-1">
                            <li>Calcola il Totale Lordo prodotto.</li>
                            <li>Sottrae l'importo della Sicurezza e della Manodopera analitica.</li>
                            <li>Applica il ribasso d'asta solo sulla parte rimanente ("Lavori").</li>
                            <li>Riaccredita Sicurezza e Manodopera al netto (senza ribasso).</li>
                        </ol>
                        Questo garantisce la massima precisione fiscale e il rispetto del Codice degli Appalti.
                    </p>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Gestione SAL</h3>
                    <p className="text-sm">Nella tab "Impostazioni & SAL" è possibile creare nuovi SAL, impostare le date di chiusura e bloccare i periodi contabili precedenti con il lucchetto per evitare modifiche accidentali.</p>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Analisi Finanziaria</h3>
                    <p className="text-sm">
                        La "Curva a S" confronta <strong>Linea Blu (Budget)</strong>, <strong>Linea Verde (Produzione Reale)</strong> e <strong>Linea Rossa (Costi Reali)</strong> per capire se il cantiere è in utile e se è in orario.
                    </p>
                </div>
            </div>
          </section>

          <div className="mt-12 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
            <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
              Manuale aggiornato alla versione: <strong>Chronos AI (Build 15 - Advanced Accounting)</strong>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UserManualView;
