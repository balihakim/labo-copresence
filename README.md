# Labo de co-présence XR — Module 08

Un espace de collaboration à distance, dans le navigateur, autour d'un **jumeau numérique** (un moteur simplifié).

- **Android (Chrome)** : réalité augmentée, le moteur est posé sur votre sol ou votre table.
- **iPhone et ordinateur** : 3D partagée.

Aucun serveur à installer. La page est hébergée par **GitHub Pages**, et la synchronisation est assurée par le réseau gratuit **Multisynq** (bibliothèque Croquet).

## Démarrage en 5 étapes (sans coder)

1. **Créez un dépôt** public sur GitHub, par exemple `labo-copresence`.
2. **Téléversez** tout le contenu de ce dossier : *Add file → Upload files*, puis glissez les fichiers **et** les dossiers `css` et `js`.
3. **Créez votre clé** gratuite sur [multisynq.io/coder](https://multisynq.io/coder).
4. **Collez la clé** dans `config.js` (icône crayon sur GitHub, puis *Commit changes*).
5. **Activez Pages** : *Settings → Pages → Deploy from a branch → main / (root) → Save*. Votre labo sera en ligne à l'adresse `https://VOTRE-PSEUDO.github.io/labo-copresence/`.

Pour une session d'équipe, **tout le monde ouvre l'URL d'une seule personne** (l'hôte) avec le même nom de salle, par exemple `…/labo-copresence/?salle=equipe-3`.

Le tutoriel complet, avec la phase de test et le lancement, est sur le site Netlify de l'atelier.

## Ce que le labo rend observable (les trois flux de la co-présence)

| Flux | Dans le labo | Où dans le code |
|---|---|---|
| Ancrage géospatial partagé | Toutes les positions sont exprimées dans le repère du moteur (`#ancre`). En RA, vous placez ce repère sur votre sol. | `index.html` (`#ancre`), `vue.js` (`maPositionLocale`) |
| Transparence attentionnelle | Avatars colorés avec rayon de regard, sélection colorée des pièces, annotations | `vue.js` (`creerAvatar`, `calculerRegard`, `creerAnnotation`) |
| Synchronisation de l'état | Modèle répliqué à l'identique chez tous ; un seul détenteur de l'outil à la fois | `modele.js` (en entier) |

Le scénario suit la boucle de *flow* : une **mission** démarre, une pièce tombe en panne, et **seul l'expert** la voit clignoter. Le technicien doit **prendre l'outil**, que l'on peut se passer, puis toucher la bonne pièce. Elle devient alors verte chez tout le monde.

## Mesures

Chaque appareil enregistre un **journal**, exportable en CSV depuis l'onglet *Mesures* (séparateur `;`, s'ouvre dans Excel ou LibreOffice).

Les lignes `mesure` sont enregistrées chaque seconde et contiennent :

- le nombre de participants ;
- la latence aller-retour (ms) ;
- la distance à l'avatar le plus proche (m) et au moteur ;
- la pièce regardée ;
- l'attention conjointe (1 si quelqu'un regarde la même pièce que vous).

Les lignes `evenement` reprennent la chronologie partagée et la durée de mission. Les lignes `questionnaire` contiennent 8 items de Likert en 7 points, inspirés de Biocca et al. (2003), plus une question ouverte. Ces items ne sont pas validés en français : leur usage est pédagogique.

## Structure

```
index.html      la page (scène A-Frame + interface)
config.js       ← le SEUL fichier à modifier (votre clé)
css/style.css   l'apparence
js/modele.js    le modèle partagé (Croquet) : participants, outil, mission, annotations
js/vue.js       la vue locale : 3D/RA, avatars, interactions, interface
js/mesures.js   journal, questionnaire, export CSV
```

## Limites connues (à discuter en débriefing)

- **Pas de voix intégrée.** Utilisez en parallèle un appel audio (Zoom, Teams, Discord, téléphone). Le flux audio spatialisé n'est donc pas couvert, ce qui fait un bon sujet de discussion.
- **Pas de RA sur iPhone.** Safari ne prend pas en charge la RA WebXR ; l'iPhone utilise la 3D partagée.
- **La salle n'est pas privée.** Le mot de passe est dérivé du nom de salle : toute personne qui connaît le nom peut entrer. C'est suffisant pour un atelier, pas pour des données sensibles.
- **Alignement en RA.** Chaque utilisateur en RA pose le moteur là où il le souhaite. Les positions restent cohérentes *par rapport au moteur*, et c'est précisément le principe de l'ancrage partagé.

## Bibliothèques

[A-Frame](https://aframe.io) 1.7.0 (MIT) et [Croquet](https://croquet.io/sdk/docs) 2.0.0 (Apache 2.0) sur le réseau [Multisynq](https://multisynq.io).
