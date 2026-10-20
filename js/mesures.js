/* ==============================================================
   MESURES DE CO-PRÉSENCE (locales à chaque appareil)
   --------------------------------------------------------------
   Triangulation : questionnaire (vécu) + comportement (distance,
   regard) + technique (latence). Chaque appareil tient son propre
   journal ; chacun exporte son CSV à la fin de la session.
   ============================================================== */

const ITEMS_QUESTIONNAIRE = [
  { code: "CP1", dim: "co-présence",       texte: "J'avais le sentiment que les autres participants étaient dans le même espace que moi." },
  { code: "CP2", dim: "co-présence",       texte: "J'avais conscience des autres, et j'avais l'impression qu'ils avaient conscience de moi." },
  { code: "AT1", dim: "attention",         texte: "Je savais où les autres regardaient ou ce qu'ils désignaient." },
  { code: "AT2", dim: "attention",         texte: "Les autres prêtaient attention à ce que je montrais ou annotais." },
  { code: "CM1", dim: "compréhension",     texte: "Je comprenais facilement les intentions des autres participants." },
  { code: "IN1", dim: "interdépendance",   texte: "Mes actions dépendaient de celles des autres, et inversement." },
  { code: "IN2", dim: "interdépendance",   texte: "Nous avons accompli la mission comme une véritable équipe." },
  { code: "PS1", dim: "présence spatiale", texte: "J'avais le sentiment que le moteur était réellement là, devant moi." }
];

const COLONNES = ["type", "horodatage_iso", "temps_s", "salle", "participant", "role", "mode",
  "nb_participants", "latence_ms", "distance_min_avatar_m", "distance_moteur_m",
  "piece_regardee", "attention_conjointe", "evenement", "valeur"];

const Mesures = {
  lignes: [],
  debut: performance.now(),
  derniereLatence: null,
  echantillonsAttention: 0,
  echantillonsConjoints: 0,
  vus: new Set(),
  minuterieEchantillon: null,
  minuteriePing: null,

  demarrer() {
    if (this.minuterieEchantillon) return;
    this.debut = performance.now();
    this.minuterieEchantillon = setInterval(() => this.echantillonner(), 1000);
    this.minuteriePing = setInterval(() => APP.publier("ping", { t: performance.now() }), 2000);
    this.construireQuestionnaire();
  },

  recevoirPong(t) {
    if (typeof t !== "number") return;
    this.derniereLatence = Math.round(performance.now() - t);
  },

  base(type) {
    const p = APP.profil || {};
    return {
      type,
      horodatage_iso: new Date().toISOString(),
      temps_s: ((performance.now() - this.debut) / 1000).toFixed(1),
      salle: APP.salle || "",
      participant: p.nom || "",
      role: p.role || "",
      mode: APP.mode
    };
  },

  /* Un échantillon par seconde */
  echantillonner() {
    const modele = APP.modele();
    if (!modele) return;
    const moi = APP.maPositionLocale();
    let nb = 0, dmin = null, conjoint = 0;
    const monRegard = APP.regard;
    for (const [id, u] of Object.entries(modele.participants)) {
      if (!u.pret) continue;
      nb++;
      if (id === APP.monId()) continue;
      const d = Math.hypot(u.p[0] - moi[0], u.p[1] - moi[1], u.p[2] - moi[2]);
      if (dmin === null || d < dmin) dmin = d;
      if (monRegard && u.regard === monRegard) conjoint = 1;
    }
    const dMoteur = Math.hypot(moi[0], moi[1] - 1.0, moi[2]);
    if (monRegard) { this.echantillonsAttention++; this.echantillonsConjoints += conjoint; }

    this.ajouter(Object.assign(this.base("mesure"), {
      nb_participants: nb,
      latence_ms: this.derniereLatence ?? "",
      distance_min_avatar_m: dmin === null ? "" : dmin.toFixed(2),
      distance_moteur_m: dMoteur.toFixed(2),
      piece_regardee: monRegard || "",
      attention_conjointe: monRegard ? conjoint : ""
    }));

    // Les événements de la chronologie partagée sont aussi journalisés
    for (const e of modele.chronologie) {
      const cle = e.t + "|" + e.texte;
      if (this.vus.has(cle)) continue;
      this.vus.add(cle);
      this.ajouter(Object.assign(this.base("evenement"), { evenement: e.texte, valeur: "t_session=" + (e.t / 1000).toFixed(1) + "s" }));
    }

    this.afficher(dmin);
  },

  noterEvenement(evenement, valeur) {
    this.ajouter(Object.assign(this.base("evenement"), { evenement, valeur: valeur ?? "" }));
  },

  ajouter(ligne) {
    this.lignes.push(ligne);
    if (this.lignes.length > 20000) this.lignes.shift();
  },

  afficher(dmin) {
    const $ = id => document.getElementById(id);
    $("m-latence").textContent = this.derniereLatence == null ? "–" : this.derniereLatence + " ms";
    $("m-distance").textContent = dmin == null ? "seul·e" : dmin.toFixed(2) + " m";
    $("m-attention").textContent = this.echantillonsAttention
      ? Math.round(100 * this.echantillonsConjoints / this.echantillonsAttention) + " %" : "–";
    $("m-lignes").textContent = this.lignes.length;
  },

  /* ---------- Questionnaire ---------- */
  construireQuestionnaire() {
    const form = document.getElementById("form-questionnaire");
    if (form.childElementCount) return;
    for (const it of ITEMS_QUESTIONNAIRE) {
      const bloc = document.createElement("div");
      bloc.className = "item-q";
      const p = document.createElement("p");
      p.textContent = it.texte;
      const echelle = document.createElement("div");
      echelle.className = "echelle";
      for (let v = 1; v <= 7; v++) {
        const l = document.createElement("label");
        const r = document.createElement("input");
        r.type = "radio"; r.name = it.code; r.value = v;
        l.appendChild(r); l.appendChild(document.createTextNode(v));
        echelle.appendChild(l);
      }
      bloc.appendChild(p); bloc.appendChild(echelle);
      form.appendChild(bloc);
    }
  },

  enregistrerQuestionnaire() {
    const form = document.getElementById("form-questionnaire");
    let n = 0;
    for (const it of ITEMS_QUESTIONNAIRE) {
      const choisi = form.querySelector(`input[name="${it.code}"]:checked`);
      if (choisi) {
        n++;
        this.ajouter(Object.assign(this.base("questionnaire"), { evenement: it.code + " (" + it.dim + ")", valeur: choisi.value }));
      }
    }
    const ouverte = document.getElementById("q-ouverte").value.trim();
    if (ouverte) this.ajouter(Object.assign(this.base("questionnaire"), { evenement: "Q_OUVERTE", valeur: ouverte }));
    return n;
  },

  /* ---------- Export CSV (séparateur ; pour Excel en français) ---------- */
  versCSV() {
    const echapper = v => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lignes = [COLONNES.join(";")];
    for (const l of this.lignes) lignes.push(COLONNES.map(c => echapper(l[c])).join(";"));
    return "﻿" + lignes.join("\r\n");
  },

  exporter() {
    const blob = new Blob([this.versCSV()], { type: "text/csv;charset=utf-8" });
    const p = APP.profil || {};
    const nom = ("copresence_" + (APP.salle || "salle") + "_" + (p.nom || "participant") + "_" +
      new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")).replace(/[^\w-]/g, "_") + ".csv";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return nom;
  }
};
