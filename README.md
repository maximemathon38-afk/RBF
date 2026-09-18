# Application de suivi du matériel — Rosset Boulon et Fils

Application web utilisable sur téléphone et ordinateur pour :

- gérer le dépôt et les chantiers ;
- ajouter et modifier le matériel ;
- transférer tout ou partie d’un matériel entre deux emplacements ;
- conserver l’historique complet des mouvements ;
- joindre les factures d’achat et de réparation ;
- joindre les fiches de suivi des passerelles ;
- sécuriser l’accès avec un compte utilisateur Supabase.

Le dépôt principal et le chantier Saskya sont créés automatiquement par le script SQL. Ils restent modifiables.

## 1. Créer le projet Supabase

1. Va sur [Supabase](https://supabase.com/) et crée un nouveau projet.
2. Dans le menu du projet, ouvre **SQL Editor**.
3. Clique sur **New query**.
4. Ouvre le fichier `supabase/schema.sql` de ce dossier.
5. Copie tout son contenu dans l’éditeur SQL puis clique sur **Run**.

Ce script crée :

- les tables `locations`, `materials`, `movements` et `attachments` ;
- la fonction sécurisée de transfert de matériel ;
- le stockage privé `materiel-documents` ;
- les règles de sécurité réservées aux utilisateurs connectés ;
- le dépôt principal et le chantier Saskya.

## 2. Créer le premier utilisateur

1. Dans Supabase, ouvre **Authentication** puis **Users**.
2. Clique sur **Add user** puis **Create new user**.
3. Renseigne ton adresse e-mail et un mot de passe.
4. Active l’option de confirmation automatique si Supabase la propose.

Tu utiliseras cet e-mail et ce mot de passe pour ouvrir l’application.

## 3. Récupérer les deux informations Supabase

Dans Supabase, ouvre **Project Settings** puis **API**.

Copie :

- **Project URL** ;
- **anon public key** ou **Publishable key**.

La clé publique `anon` peut être utilisée dans l’application. Ne mets jamais la clé `service_role` dans GitHub ou dans le navigateur.

## 4. Configurer l’application sur ton ordinateur

1. Installe [Node.js](https://nodejs.org/) version 22 ou plus récente.
2. Décompresse ce dossier.
3. Duplique `.env.example` et renomme la copie `.env.local`.
4. Dans `.env.local`, remplace les valeurs :

```env
VITE_SUPABASE_URL=https://ton-projet.supabase.co
VITE_SUPABASE_ANON_KEY=ta-cle-anon-publique
```

5. Ouvre un terminal dans le dossier puis lance :

```bash
npm install
npm run dev
```

L’adresse locale de l’application s’affichera dans le terminal.

## 5. Mettre tous les fichiers sur GitHub

Crée un dépôt GitHub vide, puis ajoute **tout le contenu de ce dossier**.

Ne mets pas ces éléments sur GitHub :

- `.env.local` ;
- `node_modules` ;
- `dist`.

Ils sont déjà exclus par le fichier `.gitignore`.

Commandes possibles :

```bash
git init
git add .
git commit -m "Première version de l'application RBF"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/TON-DEPOT.git
git push -u origin main
```

## 6. Mettre l’application en ligne

### Option conseillée : Vercel

1. Connecte-toi à [Vercel](https://vercel.com/) avec GitHub.
2. Clique sur **Add New Project** et sélectionne le dépôt.
3. Le framework détecté doit être **Vite**.
4. Dans **Environment Variables**, ajoute :
   - `VITE_SUPABASE_URL` ;
   - `VITE_SUPABASE_ANON_KEY`.
5. Clique sur **Deploy**.

À chaque modification envoyée sur GitHub, Vercel remettra automatiquement l’application à jour.

## Structure importante

```text
RBF_Suivi_Materiel_Supabase_GitHub/
├── .env.example                 Exemple de configuration
├── .github/workflows/ci.yml     Vérification automatique sur GitHub
├── public/favicon.svg           Icône de l’application
├── src/
│   ├── App.jsx                  Interface et fonctionnement
│   ├── api.js                   Échanges avec Supabase
│   ├── main.jsx                 Démarrage de React
│   ├── styles.css               Mise en page ordinateur/téléphone
│   └── supabase.js              Connexion Supabase
├── supabase/schema.sql          Base, sécurité et stockage
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

## Sauvegarde et sécurité

- Les données sont enregistrées dans la base Supabase, pas seulement sur le téléphone.
- Les documents sont dans un stockage privé et ouverts avec un lien temporaire.
- Les tables ne sont accessibles qu’aux utilisateurs Supabase connectés.
- Pour ajouter un collaborateur, crée-lui un utilisateur dans **Authentication → Users**.

## Vérifier que tout fonctionne

Après la connexion :

1. ajoute un chantier ;
2. ajoute un matériel au dépôt ;
3. transfère-le vers le chantier ;
4. vérifie le mouvement dans l’historique ;
5. ouvre la fiche du matériel et ajoute une facture ou une fiche de suivi.

