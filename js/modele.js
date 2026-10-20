
/* ==============================================================
   MODÈLE PARTAGÉ — Firebase Realtime Database
   L'état est synchronisé par le contrôleur Firebase dans vue.js.
   ============================================================== */

const PIECES = [
  { id: "bloc", nom: "Bloc moteur", panne: false, info: "Structure principale qui contient les cylindres." },
  { id: "culasse", nom: "Culasse", panne: false, info: "Ferme le haut des cylindres." },
  { id: "cyl1", nom: "Cylindre 1", panne: true, info: "Chambre de combustion n° 1." },
  { id: "cyl2", nom: "Cylindre 2", panne: true, info: "Chambre de combustion n° 2." },
  { id: "cyl3", nom: "Cylindre 3", panne: true, info: "Chambre de combustion n° 3." },
  { id: "cyl4", nom: "Cylindre 4", panne: true, info: "Chambre de combustion n° 4." },
  { id: "helice", nom: "Ventilateur", panne: false, info: "Refroidit le moteur ; tourne quand le moteur est en marche." },
  { id: "filtre", nom: "Filtre à air", panne: true, info: "Filtre l'air admis dans le moteur." },
  { id: "echappement", nom: "Collecteur d'échappement", panne: true, info: "Évacue les gaz brûlés." },
  { id: "alternateur", nom: "Alternateur", panne: true, info: "Produit l'électricité du véhicule." }
];

const COULEURS = [
  "#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9",
  "#f08c00", "#0c8599", "#e03131", "#5f3dc4"
];

const ROLES = {
  expert: "Expert",
  technicien: "Technicien",
  observateur: "Observateur"
};

/*
 * Modèle local en mémoire.
 * Firebase fournira l'état partagé et recevra les modifications.
 * Aucun accès à Croquet n'est nécessaire dans ce fichier.
 */
class Espace {
  constructor() {
    this.participants = {};
    this.annotations = [];
    this.selections = {};
    this.outil = { proprio: null };
    this.moteur = { marche: false, eclate: false };
    this.mission = {
      etat: "attente",
      panne: null,
      debut: 0,
      duree: null,
      reparePar: null,
      numero: 0,
      erreurs: 0
    };
    this.chronologie = [];
    this.indexCouleur = 0;
    this.compteurAnnot = 0;
    this.version = 0;
  }

  changer() {
    this.version++;
  }

  noter(texte) {
    this.chronologie.push({ t: Date.now(), texte });
    if (this.chronologie.length > 120) this.chronologie.shift();
  }

  nomDe(id) {
    const u = this.participants[id];
    return u ? u.nom : "?";
  }

  creerParticipant(id) {
    if (this.participants[id]) return this.participants[id];

    const couleur = COULEURS[this.indexCouleur % COULEURS.length];
    this.indexCouleur++;

    const u = {
      nom: "Participant " + this.indexCouleur,
      role: "observateur",
      couleur,
      p: [0, 1.6, 2],
      q: [0, 0, 0, 1],
      regard: null,
      mode: "3d",
      pret: false
    };

    this.participants[id] = u;
    return u;
  }

  idValide(d) {
    return !!(d && typeof d.id === "string" && this.participants[d.id]);
  }

  appliquer(etat) {
    if (!etat || typeof etat !== "object") return;

    this.participants = etat.participants || {};
    this.annotations = etat.annotations || [];
    this.selections = etat.selections || {};
    this.outil = etat.outil || { proprio: null };
    this.moteur = etat.moteur || { marche: false, eclate: false };
    this.mission = etat.mission || {
      etat: "attente", panne: null, debut: 0, duree: null,
      reparePar: null, numero: 0, erreurs: 0
    };
    this.chronologie = etat.chronologie || [];
    this.indexCouleur = etat.indexCouleur || 0;
    this.compteurAnnot = etat.compteurAnnot || 0;
    this.version = etat.version || 0;
  }

  exporter() {
    return {
      participants: this.participants,
      annotations: this.annotations,
      selections: this.selections,
      outil: this.outil,
      moteur: this.moteur,
      mission: this.mission,
      chronologie: this.chronologie,
      indexCouleur: this.indexCouleur,
      compteurAnnot: this.compteurAnnot,
      version: this.version
    };
  }
}
