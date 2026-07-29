# DIABYCIT EVEN'S

Application de gestion : onboarding & authentification, ressources financières/matérielles,
bons de sortie avec génération PDF, statistiques, paramètres identitaires (logo/tampon/signature).

C'est une **application web installable** (PWA) : une fois en ligne, elle s'installe comme une
vraie application sur ordinateur (Chrome/Edge : icône d'installation dans la barre d'adresse)
et sur téléphone (Chrome Android : "Ajouter à l'écran d'accueil" / Safari iPhone : "Sur l'écran
d'accueil"). Les données sont centralisées sur le serveur, donc partagées entre tous les
appareils qui s'y connectent.

## Ce qu'il reste à faire : la mise en ligne

Ce code fonctionne, il a été testé de bout en bout. Mais pour que votre ordinateur ET votre
téléphone y accèdent avec les mêmes données, il faut l'héberger quelque part accessible par les
deux. C'est la seule étape technique restante, et elle se fait normalement **une seule fois**.

### Option recommandée : Railway (gratuit pour démarrer)

1. Aller sur **railway.app** et créer un compte (avec votre email ou GitHub).
2. Cliquer **New Project** → **Deploy from GitHub repo** (il faut alors avoir mis ce dossier sur
   GitHub — voir ci-dessous) ou utiliser l'option d'import direct proposée par Railway.
3. Railway détecte automatiquement `package.json` et lance `npm start`.
4. Dans l'onglet **Variables**, rien n'est obligatoire pour démarrer (le port est géré
   automatiquement).
5. Ajouter un **Volume** (stockage persistant) monté sur `/app/data`, pour que la base de
   données et les PDF générés ne soient pas effacés à chaque redémarrage.
6. Une fois déployé, Railway fournit une adresse du type `https://votre-app.up.railway.app` —
   c'est cette adresse que vous ouvrez sur votre ordinateur et votre téléphone.

### Mettre le code sur GitHub (nécessaire pour l'option ci-dessus)

1. Créer un compte gratuit sur **github.com**.
2. Créer un nouveau dépôt (New repository), par exemple `diabycit-evens`.
3. Uploader tous les fichiers de ce dossier dans le dépôt (GitHub propose un glisser-déposer
   depuis l'interface web, aucune ligne de commande n'est nécessaire).

**Si ces étapes vous semblent difficiles, c'est normal** — c'est la seule partie de ce projet qui
demande un minimum d'aisance technique. Vous pouvez revenir vers moi à ce moment précis et je
vous guiderai pas à pas dans le déploiement, ou vous pouvez demander à un proche/développeur de
faire uniquement cette étape de mise en ligne (5-10 minutes une fois le compte créé).

## Premier lancement (une fois en ligne)

1. Ouvrez l'adresse fournie par l'hébergeur.
2. L'assistant d'onboarding se lance automatiquement (aucun compte n'existe encore) : suivez les
   5 étapes pour créer le compte Super-Admin.
3. Sur votre ordinateur (Chrome/Edge) : une icône d'installation apparaît dans la barre
   d'adresse — cliquez dessus pour "installer" l'application.
4. Sur votre téléphone : ouvrez le menu du navigateur → "Ajouter à l'écran d'accueil".

## Structure du projet

```
server.js       → serveur principal (API)
db.js           → schéma de la base de données (SQLite embarqué)
auth.js         → authentification (mots de passe, sessions)
pdfgen.js       → génération des bons de sortie en PDF
public/         → interface (HTML, CSS, JS, icônes, manifeste PWA)
data/           → créé automatiquement (base de données + PDF générés)
```

## Test en local (pour un développeur)

```
npm install
npm start
```
Puis ouvrir `http://localhost:3000`.
