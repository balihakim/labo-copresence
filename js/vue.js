/* ==============================================================
   VUE LOCALE : scène A-Frame, interface, lien avec le modèle partagé
   --------------------------------------------------------------
   La vue LIT le modèle à chaque image et n'écrit JAMAIS dedans :
   toute action passe par APP.publier(...) qui envoie un événement
   au réflecteur Multisynq, lequel le redistribue à tous.
   ============================================================== */
/* global AFRAME, Croquet, CONFIG, PIECES, ROLES, Mesures */

const THREE = AFRAME.THREE;
const $ = id => document.getElementById(id);

/* Formes du moteur simplifié, en mètres, dans le repère de l'ancre.
   ecl = décalage en vue éclatée. */
const FORMES = {
  bloc:        { geo: "primitive: box; width: 0.7; height: 0.35; depth: 0.4", pos: [0, 0.93, 0], rot: "0 0 0", col: "#8a96a3", ecl: [0, 0, 0] },
  culasse:     { geo: "primitive: box; width: 0.66; height: 0.1; depth: 0.36", pos: [0, 1.155, 0], rot: "0 0 0", col: "#6b7785", ecl: [0, 0.22, 0] },
  cyl1:        { geo: "primitive: cylinder; radius: 0.055; height: 0.14", pos: [-0.24, 1.275, 0], rot: "0 0 0", col: "#b8c2cc", ecl: [0, 0.45, 0] },
  cyl2:        { geo: "primitive: cylinder; radius: 0.055; height: 0.14", pos: [-0.08, 1.275, 0], rot: "0 0 0", col: "#b8c2cc", ecl: [0, 0.45, 0] },
  cyl3:        { geo: "primitive: cylinder; radius: 0.055; height: 0.14", pos: [0.08, 1.275, 0], rot: "0 0 0", col: "#b8c2cc", ecl: [0, 0.45, 0] },
  cyl4:        { geo: "primitive: cylinder; radius: 0.055; height: 0.14", pos: [0.24, 1.275, 0], rot: "0 0 0", col: "#b8c2cc", ecl: [0, 0.45, 0] },
  helice:      { geo: "primitive: cylinder; radius: 0.05; height: 0.05", pos: [0, 0.93, 0.235], rot: "90 0 0", col: "#343a40", ecl: [0, 0, 0.35] },
  filtre:      { geo: "primitive: cylinder; radius: 0.1; height: 0.12", pos: [-0.43, 0.99, 0], rot: "0 0 90", col: "#4c6ef5", ecl: [-0.3, 0, 0] },
  echappement: { geo: "primitive: cylinder; radius: 0.035; height: 0.62", pos: [0, 1.0, -0.235], rot: "0 0 90", col: "#a0522d", ecl: [0, 0, -0.3] },
  alternateur: { geo: "primitive: cylinder; radius: 0.07; height: 0.12", pos: [0.42, 0.88, 0.1], rot: "0 0 90", col: "#495057", ecl: [0.3, 0, 0] }
};
const CENTRE_MOTEUR = new THREE.Vector3(0, 1.0, 0);

const APP = {
  vue: null, session: null, profil: null, salle: "",
  mode: "3d", arPossible: false, placementVerrouille: false,
  scene: null, ancre: null, rig: null, cam: null,
  pieces: {}, avatars: {}, annots: {},
  versionVue: -1, regard: null, modeAnnoter: false,
  deplacement: { av: 0, lat: 0 }, placeSauvee: null,
  derniereEmission: 0, dernierRegard: 0, derniereMissionEtat: null,
  raycaster: new THREE.Raycaster(),
  tmpV: new THREE.Vector3(), tmpQ: new THREE.Quaternion(), tmpQ2: new THREE.Quaternion(),

  /* ---------- accès au modèle (lecture seule) ---------- */
  modele() { return this.vue ? this.vue.model : null; },
  monId() { return this.vue ? this.vue.viewId : null; },
  publier(evenement, donnees) {
    if (!this.vue) return;
    this.vue.publish(this.vue.sessionId, evenement, Object.assign({ id: this.vue.viewId }, donnees || {}));
  },

  /* ---------- démarrage ---------- */
  init() {
    this.scene = $("scene"); this.ancre = $("ancre"); this.rig = $("rig"); this.cam = $("cam");
    this.construireMoteur();
    this.construireOutil();
    this.construireGrille();
    this.brancherInterface();

    const params = new URLSearchParams(location.search);
    $("champ-salle").value = (params.get("salle") || CONFIG.SALLE_PAR_DEFAUT || "equipe-1");
    try { $("champ-nom").value = localStorage.getItem("copresence-nom") || ""; } catch (e) { /* stockage indisponible */ }
    if (!CONFIG.CLE_API || CONFIG.CLE_API.indexOf("COLLEZ") === 0) $("alerte-cle").hidden = false;

    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported("immersive-ar").then(ok => {
        this.arPossible = ok;
        $("btn-ar").hidden = !ok;
        $("note-ar").textContent = ok ? "Votre appareil prend en charge la RA (WebXR)."
          : "RA non disponible sur ce navigateur : vous êtes en 3D partagée (normal sur iPhone et ordinateur).";
      }).catch(() => { $("note-ar").textContent = "RA non disponible : 3D partagée."; });
    } else {
      $("note-ar").textContent = "WebXR absent : vous êtes en 3D partagée (normal sur iPhone et sur la plupart des ordinateurs).";
    }

    this.scene.addEventListener("enter-vr", () => this.entreeXR());
    this.scene.addEventListener("exit-vr", () => this.sortieXR());
    // En RA, un toucher sur l'interface ne doit pas être pris pour un toucher dans la scène
    $("ui").addEventListener("beforexrselect", e => e.preventDefault());
  },

  construireGrille() {
    const g = $("grille");
    for (let i = -6; i <= 6; i++) {
      const a = document.createElement("a-entity");
      a.setAttribute("line", `start: ${i} 0.002 -6; end: ${i} 0.002 6; color: #b6bfca`);
      const b = document.createElement("a-entity");
      b.setAttribute("line", `start: -6 0.002 ${i}; end: 6 0.002 ${i}; color: #b6bfca`);
      g.appendChild(a); g.appendChild(b);
    }
  },

  construireMoteur() {
    const m = $("moteur");
    const socle = document.createElement("a-entity");
    socle.setAttribute("geometry", "primitive: box; width: 0.9; height: 0.75; depth: 0.6");
    socle.setAttribute("material", "color: #343a40; roughness: 0.9");
    socle.setAttribute("position", "0 0.375 0");
    m.appendChild(socle);

    for (const p of PIECES) {
      const f = FORMES[p.id];
      const el = document.createElement("a-entity");
      el.setAttribute("geometry", f.geo);
      el.setAttribute("material", `color: ${f.col}; roughness: 0.55; metalness: 0.3`);
      el.setAttribute("position", f.pos.join(" "));
      el.setAttribute("rotation", f.rot);
      el.classList.add("cliquable");
      el.dataset.piece = p.id;
      if (p.id === "helice") {
        // trois pales sur le moyeu
        for (let k = 0; k < 3; k++) {
          const pale = document.createElement("a-entity");
          pale.setAttribute("geometry", "primitive: box; width: 0.05; height: 0.012; depth: 0.26");
          pale.setAttribute("material", "color: #868e96; metalness: 0.4");
          pale.setAttribute("rotation", `0 ${k * 120} 0`);
          pale.setAttribute("position", "0 0 0");
          el.appendChild(pale);
        }
      }
      el.addEventListener("click", ev => this.toucherPiece(p.id, ev));
      m.appendChild(el);
      this.pieces[p.id] = { el, base: new THREE.Vector3(...f.pos), ecl: new THREE.Vector3(...f.ecl), t: 0 };
    }
  },

  construireOutil() {
    const o = $("outil");
    const manche = document.createElement("a-entity");
    manche.setAttribute("geometry", "primitive: box; width: 0.028; height: 0.2; depth: 0.028");
    manche.setAttribute("material", "color: #f59f00; metalness: 0.2");
    const tete = document.createElement("a-entity");
    tete.setAttribute("geometry", "primitive: box; width: 0.08; height: 0.035; depth: 0.03");
    tete.setAttribute("material", "color: #adb5bd; metalness: 0.7");
    tete.setAttribute("position", "0 0.11 0");
    o.appendChild(manche); o.appendChild(tete);
    o.addEventListener("click", () => {
      const m = this.modele();
      if (m && m.outil.proprio !== this.monId()) { this.publier("outil-prendre"); this.toast("Vous prenez l'outil"); }
    });
    this.poserOutilSurSocle();
  },

  poserOutilSurSocle() {
    const o = $("outil").object3D;
    this.ancre.object3D.add(o);
    o.position.set(0.3, 0.77, 0.22);
    o.rotation.set(0, 0, Math.PI / 2);
  },

  /* ---------- interface ---------- */
  brancherInterface() {
    $("btn-entrer").addEventListener("click", () => this.rejoindre());
    document.querySelectorAll("#onglets button").forEach(b => b.addEventListener("click", () => this.ouvrirOnglet(b.dataset.onglet)));

    $("btn-mission").addEventListener("click", () => this.publier("mission-demarrer"));
    $("btn-mission-reinit").addEventListener("click", () => this.publier("mission-reinitialiser"));
    $("btn-prendre").addEventListener("click", () => this.publier("outil-prendre"));
    $("btn-poser").addEventListener("click", () => this.publier("outil-poser"));
    $("btn-donner").addEventListener("click", () => { const a = $("choix-donner").value; if (a) this.publier("outil-donner", { a }); });
    $("mode-annoter").addEventListener("change", e => { this.modeAnnoter = e.target.checked; this.toast(this.modeAnnoter ? "Touchez une pièce pour l'annoter" : "Mode annotation désactivé"); });
    document.querySelectorAll(".puce").forEach(b => b.addEventListener("click", () => { $("texte-annot").value = b.dataset.texte; $("mode-annoter").checked = true; this.modeAnnoter = true; }));
    $("btn-effacer-annot").addEventListener("click", () => this.publier("effacer-annotations"));
    $("btn-marche").addEventListener("click", () => this.publier("moteur-marche"));
    $("btn-eclate").addEventListener("click", () => this.publier("moteur-eclate"));
    $("btn-ar").addEventListener("click", () => this.entrerAR());
    $("btn-verrouiller").addEventListener("click", () => this.verrouillerPlacement());
    $("btn-quitter-ar").addEventListener("click", () => { try { this.scene.exitVR(); } catch (e) { /* déjà sorti */ } });
    $("btn-pdv").addEventListener("click", () => this.voirDepuis($("choix-pdv").value));
    $("btn-retour").addEventListener("click", () => this.revenirAMaPlace());
    $("btn-questionnaire").addEventListener("click", () => $("questionnaire").classList.add("visible"));
    $("btn-q-fermer").addEventListener("click", () => $("questionnaire").classList.remove("visible"));
    $("btn-q-valider").addEventListener("click", () => {
      const n = Mesures.enregistrerQuestionnaire();
      $("questionnaire").classList.remove("visible");
      this.toast(n + " réponse(s) enregistrée(s). Pensez à exporter le CSV.");
    });
    $("btn-exporter").addEventListener("click", () => { const nom = Mesures.exporter(); this.toast("Fichier : " + nom); });
    $("btn-lien").addEventListener("click", () => this.copierLien());

    // Pavé de déplacement (maintenir appuyé)
    document.querySelectorAll("#pad button").forEach(b => {
      const dir = b.dataset.dir;
      const go = e => { e.preventDefault(); if (dir === "av") this.deplacement.av = 1; if (dir === "ar") this.deplacement.av = -1; if (dir === "ga") this.deplacement.lat = -1; if (dir === "dr") this.deplacement.lat = 1; };
      const stop = () => { if (dir === "av" || dir === "ar") this.deplacement.av = 0; else this.deplacement.lat = 0; };
      b.addEventListener("pointerdown", go);
      ["pointerup", "pointerleave", "pointercancel"].forEach(t => b.addEventListener(t, stop));
    });
  },

  ouvrirOnglet(nom) {
    const deja = document.querySelector(`#onglets button[data-onglet="${nom}"]`).classList.contains("actif");
    document.querySelectorAll("#onglets button, #feuille section").forEach(x => x.classList.remove("actif"));
    if (deja) { $("feuille").hidden = true; document.body.classList.remove("feuille-ouverte"); return; }
    document.querySelector(`#onglets button[data-onglet="${nom}"]`).classList.add("actif");
    document.querySelector(`#feuille section[data-onglet="${nom}"]`).classList.add("actif");
    $("feuille").hidden = false;
    document.body.classList.add("feuille-ouverte");
  },

  toast(texte) {
    const t = $("toast");
    t.textContent = texte; t.hidden = false;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => { t.hidden = true; }, 2600);
  },

  copierLien() {
    const url = location.origin + location.pathname + "?salle=" + encodeURIComponent(this.salle);
    const fini = () => this.toast("Lien copié : " + url);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(fini, () => this.toast(url));
    else this.toast(url);
  },

  /* ---------- connexion à la salle ---------- */
  async rejoindre() {
    const nom = $("champ-nom").value.trim() || "Anonyme";
    const role = (document.querySelector('input[name="role"]:checked') || {}).value || "observateur";
    const salle = ($("champ-salle").value.trim() || "equipe-1").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, "-");

    if (!window.firebase || !firebase.database || !firebase.auth) {
      $("etat-connexion").textContent = "Erreur : les scripts Firebase ne sont pas chargés.";
      return;
    }

    try {
      localStorage.setItem("copresence-nom", nom);
    } catch (e) {}

    this.profil = { nom, role };
    this.salle = salle;
    history.replaceState(null, "", "?salle=" + encodeURIComponent(salle));
    $("btn-entrer").disabled = true;
    $("etat-connexion").textContent = "Connexion Firebase à la salle « " + salle + " »…";

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(CONFIG.FIREBASE);
      }

      const authentification = firebase.auth();
      if (!authentification.currentUser) {
        await authentification.signInAnonymously();
      }

      const uid = authentification.currentUser.uid;
      const id = uid + "-" + Math.random().toString(36).slice(2, 9);

      this.session = null;
      const adaptateur = new VueFirebase(salle, id);
      await adaptateur.connecter();

      this.lierVue(adaptateur);

      $("accueil").classList.remove("visible");
      $("barre-haut").hidden = false;
      $("onglets").hidden = false;
      $("pad").hidden = false;
      $("badge-role").textContent = ROLES[role];

      Mesures.demarrer();
      Mesures.noterEvenement("connexion", "salle=" + salle);
      this.toast("Bienvenue " + nom + " ! Vous êtes connecté à la salle " + salle + ".");

    } catch (err) {
      console.error("Erreur Firebase :", err);
      $("btn-entrer").disabled = false;
      $("etat-connexion").textContent =
        "Échec de connexion Firebase : " + (err.message || err) +
        ". Vérifiez les règles de la base et l'authentification anonyme.";
    }
  },

  lierVue(vue) {
    this.vue = vue;
    this.versionVue = -1;
    this.publier("profil", { nom: this.profil.nom, role: this.profil.role, mode: this.mode });
    $("pastille").className = "pastille ok";
  },
  delierVue(vue) {
    if (this.vue === vue) this.vue = null;
    $("pastille").className = "pastille ko";
    $("texte-etat").textContent = "Reconnexion…";
  },

  /* ---------- interactions avec l'objet partagé ---------- */
  toucherPiece(idPiece, ev) {
    const m = this.modele();
    if (!m) return;
    const inter = ev.detail && ev.detail.intersection;
    if (this.modeAnnoter && inter) {
      const local = this.ancre.object3D.worldToLocal(inter.point.clone());
      this.publier("annoter", { p: [r3(local.x), r3(local.y), r3(local.z)], texte: $("texte-annot").value.trim() || "Ici" });
      return;
    }
    if (m.outil.proprio === this.monId() && m.mission.etat === "en-cours") {
      this.publier("mission-reparer", { piece: idPiece });
      return;
    }
    const p = PIECES.find(x => x.id === idPiece);
    const dejaSel = m.selections[this.monId()] === idPiece;
    this.publier("selection", { piece: dejaSel ? null : idPiece });
    if (!dejaSel) this.toast(p.nom + " — " + p.info);
  },

  /* ---------- RA (Android / Chrome) ---------- */
  entrerAR() {
    if (!this.arPossible) return;
    try { this.scene.enterAR(); } catch (e) { this.toast("La RA n'a pas pu démarrer : " + e.message); }
  },
  entreeXR() {
    const ar = this.scene.is("ar-mode");
    this.mode = ar ? "ar" : "3d";
    if (!ar) return;
    document.body.classList.add("mode-ar");
    $("ciel").object3D.visible = false; $("sol").object3D.visible = false; $("grille").object3D.visible = false;
    $("pad").hidden = true;
    $("panneau-ar").hidden = false;
    this.placementVerrouille = false;
    this.scene.setAttribute("ar-hit-test", "enabled", true);
    this.publier("profil", { nom: this.profil.nom, role: this.profil.role, mode: "ar" });
    Mesures.noterEvenement("entree_RA");
  },
  verrouillerPlacement() {
    this.placementVerrouille = true;
    this.scene.setAttribute("ar-hit-test", "enabled", false);
    this.scene.setAttribute("cursor", "rayOrigin", "xrselect");
    $("panneau-ar").hidden = true;
    this.toast("Moteur ancré. Touchez une pièce pour interagir.");
    Mesures.noterEvenement("ancrage_RA_verrouille");
  },
  sortieXR() {
    const etaitAR = this.mode === "ar";
    this.mode = "3d";
    document.body.classList.remove("mode-ar");
    $("ciel").object3D.visible = true; $("sol").object3D.visible = true; $("grille").object3D.visible = true;
    $("panneau-ar").hidden = true;
    if (this.profil) $("pad").hidden = false;
    this.scene.setAttribute("cursor", "rayOrigin", "mouse");
    this.ancre.object3D.position.set(0, 0, -1.6);
    this.ancre.object3D.quaternion.identity();
    if (etaitAR && this.profil) {
      this.publier("profil", { nom: this.profil.nom, role: this.profil.role, mode: "3d" });
      Mesures.noterEvenement("sortie_RA");
    }
  },

  /* ---------- partage synchrone de points de vue ---------- */
  voirDepuis(id) {
    const m = this.modele();
    const u = m && m.participants[id];
    if (!u) return;
    if (this.mode === "ar") { this.toast("Disponible en 3D seulement (en RA, votre corps est la caméra)."); return; }
    if (!this.placeSauvee) this.placeSauvee = this.lirePlace();
    const monde = this.ancre.object3D.localToWorld(new THREE.Vector3(...u.p));
    this.rig.object3D.position.set(monde.x, monde.y - 1.6, monde.z);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...u.q), "YXZ");
    this.orienterCamera(e.x, e.y);
    Mesures.noterEvenement("voir_depuis", u.nom);
    this.toast("Vous voyez depuis la place de " + u.nom);
  },
  revenirAMaPlace() {
    if (!this.placeSauvee) return;
    const s = this.placeSauvee;
    this.rig.object3D.position.copy(s.pos);
    this.orienterCamera(s.pitch, s.yaw);
    this.placeSauvee = null;
  },
  lirePlace() {
    const lc = this.cam.components["look-controls"];
    return { pos: this.rig.object3D.position.clone(),
             pitch: lc ? lc.pitchObject.rotation.x : 0, yaw: lc ? lc.yawObject.rotation.y : 0 };
  },
  orienterCamera(pitch, yaw) {
    const lc = this.cam.components["look-controls"];
    if (lc && lc.pitchObject && lc.yawObject) {
      lc.pitchObject.rotation.x = pitch;
      lc.yawObject.rotation.y = yaw;
    }
  },

  /* ---------- pose locale dans le repère de l'ancre ---------- */
  cameraThree() { return this.cam.getObject3D("camera"); },
  maPositionLocale() {
    const c = this.cameraThree();
    if (!c) return [0, 1.6, 1.6];
    c.getWorldPosition(this.tmpV);
    const l = this.ancre.object3D.worldToLocal(this.tmpV.clone());
    return [l.x, l.y, l.z];
  },
  monOrientationLocale() {
    const c = this.cameraThree();
    c.getWorldQuaternion(this.tmpQ);
    this.ancre.object3D.getWorldQuaternion(this.tmpQ2);
    const q = this.tmpQ2.invert().multiply(this.tmpQ);
    return [q.x, q.y, q.z, q.w];
  },

  /* ---------- boucle par image (appelée par A-Frame, y compris en RA) ---------- */
  tick(t, dt) {
    dt = Math.min(dt || 16, 100);
    // En session immersive, certains navigateurs suspendent requestAnimationFrame :
    // on fait alors avancer Multisynq manuellement.
    //if (this.session && this.scene.renderer && this.scene.renderer.xr.isPresenting && typeof this.session.step === "function") {
    //  try { this.session.step(performance.now()); } catch (e) { /* ignorer */ }
    //}
    this.deplacer(dt);
    const m = this.modele();
    if (!m) return;

    if (t - this.dernierRegard > 100) { this.dernierRegard = t; this.calculerRegard(); }
    if (t - this.derniereEmission > 100) { this.derniereEmission = t; this.emettrePose(); }
    if (m.version !== this.versionVue) { this.versionVue = m.version; this.rafraichir(m); }

    this.animerAvatars(m, dt);
    this.animerMoteur(m, t, dt);
    this.placerOutil(m);
  },

  deplacer(dt) {
    const d = this.deplacement;
    if (!d.av && !d.lat) return;
    const yaw = this.cam.object3D.rotation.y;
    const v = 1.2 * dt / 1000;
    const o = this.rig.object3D.position;
    o.x += (-Math.sin(yaw) * d.av + Math.cos(yaw) * d.lat) * v;
    o.z += (-Math.cos(yaw) * d.av - Math.sin(yaw) * d.lat) * v;
  },

  calculerRegard() {
    const c = this.cameraThree();
    if (!c) return;
    c.getWorldPosition(this.tmpV);
    c.getWorldQuaternion(this.tmpQ);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.tmpQ);
    this.raycaster.set(this.tmpV, dir);
    this.raycaster.far = 8;
    const objets = Object.values(this.pieces).map(p => p.el.object3D);
    const hits = this.raycaster.intersectObjects(objets, true);
    let id = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !(o.el && o.el.dataset && o.el.dataset.piece)) o = o.parent;
      if (o) { id = o.el.dataset.piece; break; }
    }
    this.regard = id;
  },

  emettrePose() {
    const p = this.maPositionLocale(), q = this.monOrientationLocale();
    this.publier("pose", { p: p.map(r3), q: q.map(r3), regard: this.regard, mode: this.mode });
  },

  /* ---------- rafraîchissement quand l'état partagé change ---------- */
  rafraichir(m) {
    const moi = this.monId();
    const ids = Object.keys(m.participants).filter(id => m.participants[id].pret);
    const nb = ids.length;

    // barre d'état
    const lat = Mesures.derniereLatence;
    $("texte-etat").textContent = "Salle « " + this.salle + " » · " + nb + " participant" + (nb > 1 ? "s" : "") + (lat != null ? " · " + lat + " ms" : "");
    const u = m.participants[moi];
    if (u) $("badge-role").style.background = u.couleur;

    // avatars : création / suppression
    for (const id of ids) if (id !== moi && !this.avatars[id]) this.creerAvatar(id, m.participants[id]);
    for (const id of Object.keys(this.avatars)) {
      if (!m.participants[id] || !m.participants[id].pret || id === moi) { this.avatars[id].el.remove(); delete this.avatars[id]; }
    }
    for (const id of Object.keys(this.avatars)) this.majEtiquette(id, m.participants[id]);

    // listes
    const opts = ids.filter(id => id !== moi).map(id => `<option value="${id}">${echap(m.participants[id].nom)} (${ROLES[m.participants[id].role]})</option>`).join("");
    const vide = '<option value="">— personne d\'autre —</option>';
    $("choix-donner").innerHTML = opts || vide;
    $("choix-pdv").innerHTML = opts || vide;
    $("liste-participants").innerHTML = ids.map(id => {
      const x = m.participants[id];
      return `<li><span class="rond" style="background:${x.couleur}"></span>${echap(x.nom)}${id === moi ? " (vous)" : ""} · ${ROLES[x.role]} · ${x.mode === "ar" ? "RA" : "3D"}</li>`;
    }).join("");

    // outil
    const proprio = m.outil.proprio;
    $("outil-etat").textContent = !proprio ? "L'outil est posé sur le socle." :
      proprio === moi ? "Vous tenez l'outil." : (m.participants[proprio] ? m.participants[proprio].nom : "?") + " tient l'outil.";
    $("btn-poser").disabled = proprio !== moi;
    $("btn-donner").disabled = proprio !== moi || !opts;
    $("btn-prendre").disabled = proprio === moi;

    // moteur
    $("btn-marche").textContent = m.moteur.marche ? "Arrêter le moteur" : "Démarrer le moteur";
    $("btn-eclate").textContent = m.moteur.eclate ? "Refermer la vue" : "Vue éclatée";

    // mission
    const mi = m.mission;
    const role = this.profil.role;
    let etat = "", aide = "";
    if (mi.etat === "attente") {
      etat = "En attente. N'importe qui peut démarrer une mission.";
      aide = "Une pièce tombera en panne. Seul l'expert la verra clignoter en rouge.";
    } else if (mi.etat === "en-cours") {
      etat = "Mission " + mi.numero + " en cours · " + mi.erreurs + " essai(s) manqué(s).";
      if (role === "expert") {
        const p = PIECES.find(x => x.id === mi.panne);
        aide = "Vous seul voyez la panne : « " + p.nom + " » clignote en rouge. Guidez le technicien par la voix, le regard et les annotations, sans dire le nom de la pièce !";
      } else if (proprio === moi) {
        aide = "Vous tenez l'outil : touchez la pièce que l'expert vous désigne pour la réparer.";
      } else {
        aide = "Écoutez l'expert. Pour réparer, il faut d'abord prendre l'outil (onglet Outil).";
      }
    } else if (mi.etat === "reussie") {
      etat = "Mission " + mi.numero + " réussie par " + mi.reparePar + " en " + Math.round(mi.duree / 1000) + " s (" + mi.erreurs + " essai(s) manqué(s)).";
      aide = "Changez de rôles et relancez une mission, puis remplissez le questionnaire (onglet Mesures).";
    }
    $("mission-etat").textContent = etat;
    $("mission-aide").textContent = aide;
    $("btn-mission").disabled = mi.etat === "en-cours";
    if (this.derniereMissionEtat !== mi.etat + mi.numero) {
      if (mi.etat === "reussie") Mesures.noterEvenement("mission_reussie_duree_s", (mi.duree / 1000).toFixed(1));
      if (mi.etat === "en-cours") Mesures.noterEvenement("mission_demarree", "n=" + mi.numero);
      this.derniereMissionEtat = mi.etat + mi.numero;
    }
    $("chronologie").innerHTML = m.chronologie.slice(-8).reverse().map(e => `<li>${echap(e.texte)}</li>`).join("");

    // annotations : diff par identifiant
    const presentes = new Set(m.annotations.map(a => a.id));
    for (const id of Object.keys(this.annots)) if (!presentes.has(+id)) { this.annots[id].remove(); delete this.annots[id]; }
    for (const a of m.annotations) if (!this.annots[a.id]) this.creerAnnotation(a);
  },

  creerAvatar(id, u) {
    const el = document.createElement("a-entity");
    const tete = document.createElement("a-entity");
    tete.setAttribute("geometry", "primitive: sphere; radius: 0.12");
    tete.setAttribute("material", `color: ${u.couleur}; roughness: 0.6`);
    const visiere = document.createElement("a-entity");
    visiere.setAttribute("geometry", "primitive: box; width: 0.16; height: 0.05; depth: 0.04");
    visiere.setAttribute("material", "color: #1f2430");
    visiere.setAttribute("position", "0 0.02 -0.11");
    const corps = document.createElement("a-entity");
    corps.setAttribute("geometry", "primitive: cylinder; radius: 0.11; height: 0.5");
    corps.setAttribute("material", `color: ${u.couleur}; opacity: 0.35; transparent: true`);
    corps.setAttribute("position", "0 -0.42 0");
    // rayon de regard : la « transparence attentionnelle »
    const rayon = document.createElement("a-entity");
    rayon.setAttribute("line", `start: 0 0 -0.12; end: 0 0 -1.2; color: ${u.couleur}; opacity: 0.7`);
    const etiquette = document.createElement("a-entity");
    etiquette.setAttribute("text", { value: u.nom, align: "center", width: 1.2, color: "#1f2430", font: "dejavu", wrapCount: 22 });
    etiquette.setAttribute("position", "0 0.26 0");
    const fond = document.createElement("a-entity");
    fond.setAttribute("geometry", "primitive: plane; width: 0.5; height: 0.09");
    fond.setAttribute("material", "color: #ffffff; opacity: 0.85; transparent: true; side: double");
    fond.setAttribute("position", "0 0.26 0");
    el.appendChild(tete); el.appendChild(visiere); el.appendChild(corps); el.appendChild(rayon);
    el.appendChild(fond); el.appendChild(etiquette);
    $("avatars").appendChild(el);
    el.object3D.position.set(...u.p);
    this.avatars[id] = { el, etiquette, fond, cible: new THREE.Vector3(...u.p), cibleQ: new THREE.Quaternion(...u.q), texte: "" };
  },

  majEtiquette(id, u) {
    const a = this.avatars[id];
    const texte = u.nom + " · " + ROLES[u.role] + (u.mode === "ar" ? " · RA" : "");
    if (a.texte !== texte) { a.texte = texte; a.etiquette.setAttribute("text", "value", texte); }
  },

  animerAvatars(m, dt) {
    const k = 1 - Math.pow(0.001, dt / 1000 * 4); // lissage
    const c = this.cameraThree();
    if (c) c.getWorldPosition(this.tmpV);
    for (const [id, a] of Object.entries(this.avatars)) {
      const u = m.participants[id];
      if (!u) continue;
      a.cible.set(u.p[0], u.p[1], u.p[2]);
      a.cibleQ.set(u.q[0], u.q[1], u.q[2], u.q[3]);
      const o = a.el.object3D;
      o.position.lerp(a.cible, k);
      o.quaternion.slerp(a.cibleQ, k);
      // l'étiquette fait toujours face à la caméra locale
      if (c) { a.etiquette.object3D.lookAt(this.tmpV); a.fond.object3D.lookAt(this.tmpV); }
    }
  },

  creerAnnotation(a) {
    const el = document.createElement("a-entity");
    const point = document.createElement("a-entity");
    point.setAttribute("geometry", "primitive: sphere; radius: 0.022");
    point.setAttribute("material", `color: ${a.couleur}; emissive: ${a.couleur}; emissiveIntensity: 0.5`);
    const tige = document.createElement("a-entity");
    tige.setAttribute("line", `start: 0 0 0; end: 0 0.12 0; color: ${a.couleur}`);
    const txt = document.createElement("a-entity");
    txt.setAttribute("text", { value: a.texte, align: "center", width: 0.8, color: a.couleur, font: "dejavu", wrapCount: 18 });
    txt.setAttribute("position", "0 0.17 0");
    txt.setAttribute("face-camera", "");
    el.appendChild(point); el.appendChild(tige); el.appendChild(txt);
    el.object3D.position.set(...a.p);
    $("annotations").appendChild(el);
    this.annots[a.id] = el;
  },

  animerMoteur(m, t, dt) {
    const moi = this.monId();
    const estExpert = this.profil && this.profil.role === "expert";
    const pulse = 0.35 + 0.35 * Math.sin(t / 180);
    const selParPiece = {};
    for (const [id, piece] of Object.entries(m.selections)) {
      if (m.participants[id]) selParPiece[piece] = m.participants[id].couleur;
    }
    const k = Math.min(1, dt / 250);
    for (const [id, p] of Object.entries(this.pieces)) {
      // vue éclatée (animation douce)
      p.t += ((m.moteur.eclate ? 1 : 0) - p.t) * k;
      p.el.object3D.position.copy(p.base).addScaledVector(p.ecl, p.t);
      // couleur d'état
      let couleur = null, intensite = 0;
      if (m.mission.etat === "reussie" && id === m.mission.panne) { couleur = "#2f9e44"; intensite = 0.6; }
      else if (selParPiece[id]) { couleur = selParPiece[id]; intensite = 0.45; }
      else if (estExpert && m.mission.etat === "en-cours" && id === m.mission.panne) { couleur = "#e03131"; intensite = pulse; }
      this.teinter(p, couleur, intensite);
    }
    // ventilateur
    if (m.moteur.marche) this.pieces.helice.el.object3D.rotateY(dt / 1000 * 12);
    void moi;
  },

  teinter(p, couleur, intensite) {
    const cle = couleur + ":" + intensite.toFixed(2);
    if (p.cle === cle) return;
    p.cle = cle;
    p.el.object3D.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive.set(couleur || "#000000");
        o.material.emissiveIntensity = couleur ? intensite : 0;
      }
    });
  },

  /* L'outil suit son détenteur : propriété réseau rendue visible */
  placerOutil(m) {
    const o = $("outil").object3D;
    const proprio = m.outil.proprio;
    if (proprio === this.etatOutil) return;
    this.etatOutil = proprio;
    if (!proprio || !m.participants[proprio]) { this.poserOutilSurSocle(); return; }
    if (proprio === this.monId()) {
      const c = this.cameraThree();
      c.add(o);
      o.position.set(0.12, -0.13, -0.35);
      o.rotation.set(-0.5, 0, 0.3);
      this.toast("Vous tenez l'outil");
      return;
    }
    const a = this.avatars[proprio];
    if (a) {
      a.el.object3D.add(o);
      o.position.set(0.16, -0.22, -0.2);
      o.rotation.set(-0.4, 0, 0.3);
    } else { this.etatOutil = undefined; } // avatar pas encore créé : réessayer à l'image suivante
  }
};

function r3(x) { return Math.round(x * 1000) / 1000; }
function echap(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- composants A-Frame ---------- */
AFRAME.registerComponent("boucle-copresence", {
  tick(t, dt) { APP.tick(t, dt); }
});
AFRAME.registerComponent("face-camera", {
  tick() {
    const c = this.el.sceneEl.camera;
    if (!c) return;
    c.getWorldPosition(APP.tmpV);
    this.el.object3D.lookAt(APP.tmpV);
  }
});


/* ---------- Adaptateur Firebase : remplace Croquet ---------- */

class VueFirebase {
  constructor(salle, id) {
    this.viewId = id;
    this.sessionId = salle;
    this.model = new Espace();
    this.db = firebase.database();
    this.roomRef = this.db.ref("salles/" + salle);
    this.etatRef = this.roomRef.child("etat");
    this.presenceRef = this.roomRef.child("presence/" + id);
    this.connecte = false;
    this.ecouteur = null;
  }

  async connecter() {
    // Créer l'état initial si cette salle est encore vide.
    await this.etatRef.transaction(etat => {
      if (etat) return;
      return this.model.exporter();
    });

    // Enregistrer la présence et retirer ce marqueur à la déconnexion.
    await this.presenceRef.set(true);
    await this.presenceRef.onDisconnect().remove();

    this.ecouteur = snapshot => {
      const etat = snapshot.val();
      if (!etat) return;
      this.model.appliquer(etat);

      // Mettre à jour la scène quand l'état partagé change.
      if (APP.vue === this) {
        APP.rafraichir(this.model);
      }
    };

    this.etatRef.on("value", this.ecouteur);
    this.connecte = true;

    // Créer le participant et diffuser son profil.
    await this.publish(this.sessionId, "profil", {
      id: this.viewId,
      nom: APP.profil.nom,
      role: APP.profil.role,
      mode: APP.mode
    });
  }

  async publish(_sessionId, evenement, donnees) {
    if (!this.connecte && evenement !== "profil") return;

    const d = Object.assign({ id: this.viewId }, donnees || {});

    if (evenement === "ping") {
      if (typeof d.t === "number") Mesures.recevoirPong(d.t);
      return;
    }

    await this.etatRef.transaction(etat => {
      if (!etat) etat = new Espace().exporter();

      etat.participants = etat.participants || {};
      etat.annotations = etat.annotations || [];
      etat.selections = etat.selections || {};
      etat.outil = etat.outil || { proprio: null };
      etat.moteur = etat.moteur || { marche: false, eclate: false };
      etat.chronologie = etat.chronologie || [];
      etat.mission = etat.mission || {
        etat: "attente", panne: null, debut: 0,
        duree: null, reparePar: null, numero: 0, erreurs: 0
      };

      const participants = etat.participants;
      const moi = participants[d.id];

      if (evenement === "profil") {
        if (!participants[d.id]) {
          const couleurs = [
            "#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9",
            "#f08c00", "#0c8599", "#e03131", "#5f3dc4"
          ];
          const nombre = Object.keys(participants).length;
          participants[d.id] = {
            nom: d.nom || "Anonyme",
            role: d.role || "observateur",
            couleur: couleurs[nombre % couleurs.length],
            p: [0, 1.6, 2],
            q: [0, 0, 0, 1],
            regard: null,
            mode: d.mode || "3d",
            pret: true
          };
        } else {
          participants[d.id].nom = d.nom || participants[d.id].nom;
          participants[d.id].role = d.role || participants[d.id].role;
          participants[d.id].mode = d.mode || "3d";
          participants[d.id].pret = true;
        }
        etat.chronologie.push({ t: Date.now(), texte: (d.nom || "Participant") + " a rejoint la salle." });
      } else if (evenement === "pose" && moi) {
        moi.p = d.p || moi.p;
        moi.q = d.q || moi.q;
        moi.regard = d.regard === undefined ? moi.regard : d.regard;
        moi.mode = d.mode || moi.mode;
      } else if (evenement === "selection" && moi) {
        if (d.piece) etat.selections[d.id] = d.piece;
        else delete etat.selections[d.id];
      } else if (evenement === "annoter" && moi) {
        etat.annotations.push({
          id: Date.now() + Math.random(),
          p: d.p || [0, 0, 0],
          texte: d.texte || "Annotation",
          couleur: moi.couleur,
          auteur: moi.nom
        });
        if (etat.annotations.length > 100) etat.annotations.shift();
      } else if (evenement === "effacer-annotations" && moi) {
        etat.annotations = [];
      } else if (evenement === "outil-prendre" && moi) {
        if (!etat.outil.proprio || etat.outil.proprio === d.id) {
          etat.outil.proprio = d.id;
          etat.chronologie.push({ t: Date.now(), texte: moi.nom + " a pris l'outil." });
        }
      } else if (evenement === "outil-poser" && moi) {
        if (etat.outil.proprio === d.id) {
          etat.outil.proprio = null;
          etat.chronologie.push({ t: Date.now(), texte: moi.nom + " a posé l'outil." });
        }
      } else if (evenement === "outil-donner" && moi) {
        if (etat.outil.proprio === d.id && participants[d.a]) {
          etat.outil.proprio = d.a;
          etat.chronologie.push({ t: Date.now(), texte: moi.nom + " a donné l'outil à " + participants[d.a].nom + "." });
        }
      } else if (evenement === "moteur-marche" && moi) {
        etat.moteur.marche = !etat.moteur.marche;
      } else if (evenement === "moteur-eclate" && moi) {
        etat.moteur.eclate = !etat.moteur.eclate;
      } else if (evenement === "mission-demarrer" && moi) {
        if (etat.mission.etat !== "en-cours") {
          const pannes = PIECES.filter(p => p.panne);
          const panne = pannes[Math.floor(Math.random() * pannes.length)];
          etat.mission.etat = "en-cours";
          etat.mission.panne = panne.id;
          etat.mission.debut = Date.now();
          etat.mission.duree = null;
          etat.mission.reparePar = null;
          etat.mission.numero = (etat.mission.numero || 0) + 1;
          etat.mission.erreurs = 0;
          etat.chronologie.push({ t: Date.now(), texte: "Mission " + etat.mission.numero + " démarrée." });
        }
      } else if (evenement === "mission-reparer" && moi) {
        if (etat.mission.etat === "en-cours" &&
            etat.outil.proprio === d.id) {
          if (d.piece === etat.mission.panne) {
            etat.mission.etat = "reussie";
            etat.mission.duree = Date.now() - etat.mission.debut;
            etat.mission.reparePar = moi.nom;
            etat.chronologie.push({ t: Date.now(), texte: moi.nom + " a réparé la panne." });
            etat.outil.proprio = null;
          } else {
            etat.mission.erreurs = (etat.mission.erreurs || 0) + 1;
            etat.chronologie.push({ t: Date.now(), texte: "Mauvaise pièce sélectionnée." });
          }
        }
      } else if (evenement === "mission-reinitialiser" && moi) {
        etat.mission.etat = "attente";
        etat.mission.panne = null;
        etat.mission.debut = 0;
        etat.mission.duree = null;
        etat.mission.reparePar = null;
        etat.mission.erreurs = 0;
      }

      etat.version = (etat.version || 0) + 1;
      if (etat.chronologie.length > 120) {
        etat.chronologie = etat.chronologie.slice(-120);
      }
      return etat;
    });
  }

  detach() {
    if (this.ecouteur) this.etatRef.off("value", this.ecouteur);
    this.presenceRef.remove().catch(() => {});
    this.connecte = false;
    APP.delierVue(this);
  }
}


document.addEventListener("DOMContentLoaded", () => {
  const scene = document.getElementById("scene");
  if (scene.hasLoaded) APP.init(); else scene.addEventListener("loaded", () => APP.init());
});
