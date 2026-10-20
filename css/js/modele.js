/* ==============================================================
   MODÈLE PARTAGÉ (Croquet / Multisynq)
   --------------------------------------------------------------
   Ce code s'exécute À L'IDENTIQUE sur chaque appareil de la salle.
   Le réseau ne transporte que des ÉVÉNEMENTS (horodatés et ordonnés
   par le réflecteur Multisynq) : tout le monde calcule donc le même
   état. C'est le 3e flux de la co-présence : la synchronisation de
   l'état partagé.
   Règle d'or : le modèle ne lit jamais rien hors de lui-même
   (ni Date, ni DOM, ni réseau). Il ne réagit qu'aux événements.
   ============================================================== */

/* Pièces du jumeau numérique (le moteur simplifié).
   Partagées entre le modèle (identifiants) et la vue (formes 3D). */
const PIECES = [
  { id: "bloc",        nom: "Bloc moteur",          panne: false, info: "Structure principale qui contient les cylindres." },
  { id: "culasse",     nom: "Culasse",              panne: false, info: "Ferme le haut des cylindres." },
  { id: "cyl1",        nom: "Cylindre 1",           panne: true,  info: "Chambre de combustion n° 1." },
  { id: "cyl2",        nom: "Cylindre 2",           panne: true,  info: "Chambre de combustion n° 2." },
  { id: "cyl3",        nom: "Cylindre 3",           panne: true,  info: "Chambre de combustion n° 3." },
  { id: "cyl4",        nom: "Cylindre 4",           panne: true,  info: "Chambre de combustion n° 4." },
  { id: "helice",      nom: "Ventilateur",          panne: false, info: "Refroidit le moteur ; tourne quand le moteur est en marche." },
  { id: "filtre",      nom: "Filtre à air",         panne: true,  info: "Filtre l'air admis dans le moteur." },
  { id: "echappement", nom: "Collecteur d'échappement", panne: true, info: "Évacue les gaz brûlés." },
  { id: "alternateur", nom: "Alternateur",          panne: true,  info: "Produit l'électricité du véhicule." }
];

const COULEURS = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#e03131", "#5f3dc4"];
const ROLES = { expert: "Expert", technicien: "Technicien", observateur: "Observateur" };

class Espace extends Croquet.Model {

  init() {
    this.participants = {};        // viewId -> { nom, role, couleur, p, q, regard }
    this.annotations = [];         // { id, p, texte, couleur, auteur, t }
    this.selections = {};          // viewId -> id de pièce sélectionnée
    this.outil = { proprio: null };
    this.moteur = { marche: false, eclate: false };
    this.mission = { etat: "attente", panne: null, debut: 0, duree: null, reparePar: null, numero: 0, erreurs: 0 };
    this.chronologie = [];         // { t, texte } — trace asynchrone, visible par les arrivants tardifs
    this.indexCouleur = 0;
    this.compteurAnnot = 0;
    this.version = 0;              // incrémenté à chaque changement (hors poses)

    this.subscribe(this.sessionId, "view-join", this.arrivee);
    this.subscribe(this.sessionId, "view-exit", this.depart);
    this.subscribe(this.sessionId, "profil", this.profil);
    this.subscribe(this.sessionId, "pose", this.pose);
    this.subscribe(this.sessionId, "ping", this.ping);
    this.subscribe(this.sessionId, "selection", this.selection);
    this.subscribe(this.sessionId, "annoter", this.annoter);
    this.subscribe(this.sessionId, "effacer-annotations", this.effacerAnnotations);
    this.subscribe(this.sessionId, "outil-prendre", this.outilPrendre);
    this.subscribe(this.sessionId, "outil-donner", this.outilDonner);
    this.subscribe(this.sessionId, "outil-poser", this.outilPoser);
    this.subscribe(this.sessionId, "moteur-marche", this.moteurMarche);
    this.subscribe(this.sessionId, "moteur-eclate", this.moteurEclate);
    this.subscribe(this.sessionId, "mission-demarrer", this.missionDemarrer);
    this.subscribe(this.sessionId, "mission-reparer", this.missionReparer);
    this.subscribe(this.sessionId, "mission-reinitialiser", this.missionReinitialiser);
  }

  /* ---------- utilitaires internes ---------- */
  changer() { this.version++; }
  noter(texte) {
    this.chronologie.push({ t: this.now(), texte });
    if (this.chronologie.length > 120) this.chronologie.shift();
  }
  nomDe(id) { const u = this.participants[id]; return u ? u.nom : "?"; }
  creerParticipant(id) {
    if (this.participants[id]) return this.participants[id];
    const couleur = COULEURS[this.indexCouleur % COULEURS.length];
    this.indexCouleur++;
    const u = { nom: "Participant " + this.indexCouleur, role: "observateur", couleur,
                p: [0, 1.6, 2], q: [0, 0, 0, 1], regard: null, mode: "3d", pret: false };
    this.participants[id] = u;
    return u;
  }
  idValide(d) { return d && typeof d.id === "string" && this.participants[d.id]; }

  /* ---------- présence dans la salle ---------- */
  arrivee(d) {
    const id = typeof d === "string" ? d : d && d.viewId;
    if (!id) return;
    this.creerParticipant(id);
    this.changer();
  }
  depart(d) {
    const id = typeof d === "string" ? d : d && d.viewId;
    const u = this.participants[id];
    if (!u) return;
    if (u.pret) this.noter(u.nom + " a quitté la salle");
    if (this.outil.proprio === id) { this.outil.proprio = null; this.noter("L'outil est retombé sur le socle"); }
    delete this.selections[id];
    delete this.participants[id];
    this.changer();
  }
  profil(d) {
    if (!d || typeof d.id !== "string") return;
    const u = this.creerParticipant(d.id);
    u.nom = String(d.nom || u.nom).slice(0, 24);
    u.role = ROLES[d.role] ? d.role : "observateur";
    u.mode = d.mode === "ar" ? "ar" : "3d";
    if (!u.pret) this.noter(u.nom + " a rejoint la salle (" + ROLES[u.role] + ")");
    u.pret = true;
    this.changer();
  }

  /* ---------- 2e flux : position, orientation, regard (10 Hz) ---------- */
  pose(d) {
    if (!this.idValide(d)) return;
    const u = this.participants[d.id];
    if (Array.isArray(d.p) && d.p.length === 3) u.p = d.p;
    if (Array.isArray(d.q) && d.q.length === 4) u.q = d.q;
    u.regard = typeof d.regard === "string" ? d.regard : null;
    if (d.mode === "ar" || d.mode === "3d") {
      if (u.mode !== d.mode) { u.mode = d.mode; this.changer(); }
    }
  }

  /* mesure de latence : renvoie l'heure locale de l'émetteur à lui seul */
  ping(d) {
    if (!d || typeof d.id !== "string") return;
    this.publish(d.id, "pong", d.t);
  }

  /* ---------- objet partagé ---------- */
  selection(d) {
    if (!this.idValide(d)) return;
    if (d.piece && PIECES.some(p => p.id === d.piece)) this.selections[d.id] = d.piece;
    else delete this.selections[d.id];
    this.changer();
  }

  annoter(d) {
    if (!this.idValide(d) || !Array.isArray(d.p)) return;
    const u = this.participants[d.id];
    this.compteurAnnot++;
    this.annotations.push({ id: this.compteurAnnot, p: d.p.slice(0, 3), texte: String(d.texte || "Ici").slice(0, 40),
                            couleur: u.couleur, auteur: d.id, nomAuteur: u.nom, t: this.now() });
    if (this.annotations.length > 60) this.annotations.shift();
    this.noter(u.nom + " a annoté : « " + String(d.texte || "Ici").slice(0, 40) + " »");
    this.changer();
  }
  effacerAnnotations(d) {
    if (!this.idValide(d)) return;
    const avant = this.annotations.length;
    this.annotations = this.annotations.filter(a => a.auteur !== d.id);
    if (avant !== this.annotations.length) this.noter(this.nomDe(d.id) + " a effacé ses annotations");
    this.changer();
  }

  /* Propriété réseau de l'outil : un seul détenteur à la fois */
  outilPrendre(d) {
    if (!this.idValide(d)) return;
    const ancien = this.outil.proprio;
    if (ancien === d.id) return;
    this.outil.proprio = d.id;
    this.noter(this.nomDe(d.id) + (ancien ? " a pris l'outil des mains de " + this.nomDe(ancien) : " a pris l'outil"));
    this.changer();
  }
  outilDonner(d) {
    if (!this.idValide(d) || this.outil.proprio !== d.id || !this.participants[d.a]) return;
    this.outil.proprio = d.a;
    this.noter(this.nomDe(d.id) + " a passé l'outil à " + this.nomDe(d.a));
    this.changer();
  }
  outilPoser(d) {
    if (!this.idValide(d) || this.outil.proprio !== d.id) return;
    this.outil.proprio = null;
    this.noter(this.nomDe(d.id) + " a reposé l'outil");
    this.changer();
  }

  moteurMarche(d) {
    if (!this.idValide(d)) return;
    this.moteur.marche = !this.moteur.marche;
    this.noter(this.nomDe(d.id) + (this.moteur.marche ? " a démarré le moteur" : " a arrêté le moteur"));
    this.changer();
  }
  moteurEclate(d) {
    if (!this.idValide(d)) return;
    this.moteur.eclate = !this.moteur.eclate;
    this.noter(this.nomDe(d.id) + (this.moteur.eclate ? " a ouvert la vue éclatée" : " a refermé la vue éclatée"));
    this.changer();
  }

  /* ---------- la mission (boucle de flow) ---------- */
  missionDemarrer(d) {
    if (!this.idValide(d) || this.mission.etat === "en-cours") return;
    const candidates = PIECES.filter(p => p.panne);
    const choix = candidates[Math.floor(Math.random() * candidates.length)]; // aléatoire identique partout
    this.mission = { etat: "en-cours", panne: choix.id, debut: this.now(), duree: null,
                     reparePar: null, numero: this.mission.numero + 1, erreurs: 0 };
    this.noter("Mission " + this.mission.numero + " lancée par " + this.nomDe(d.id) + " : une pièce est en panne");
    this.changer();
  }
  missionReparer(d) {
    if (!this.idValide(d) || this.mission.etat !== "en-cours") return;
    if (this.outil.proprio !== d.id) return;            // il faut tenir l'outil
    if (d.piece === this.mission.panne) {
      this.mission.etat = "reussie";
      this.mission.duree = this.now() - this.mission.debut;
      this.mission.reparePar = this.nomDe(d.id);
      this.noter("✔ " + this.nomDe(d.id) + " a réparé la pièce en " + Math.round(this.mission.duree / 1000) + " s");
    } else {
      this.mission.erreurs++;
      const p = PIECES.find(x => x.id === d.piece);
      this.noter("✖ " + this.nomDe(d.id) + " a essayé sur « " + (p ? p.nom : d.piece) + " » : ce n'est pas la bonne pièce");
    }
    this.changer();
  }
  missionReinitialiser(d) {
    if (!this.idValide(d)) return;
    this.mission = { etat: "attente", panne: null, debut: 0, duree: null, reparePar: null,
                     numero: this.mission.numero, erreurs: 0 };
    this.noter(this.nomDe(d.id) + " a réinitialisé la mission");
    this.changer();
  }
}
Espace.register("Espace");
