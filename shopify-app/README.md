# App Shopify « Atelier TURN »

Ajoute la page **Suivi atelier** dans l'espace client de turnshop.fr (menu du compte).

## Publier (une seule fois, puis à chaque modification)
1. `cd shopify-app`
2. `npm install`
3. `npm run deploy` — la commande te demande de te connecter à Shopify, puis de **créer une nouvelle app** (« Atelier TURN ») sur ton organisation. Elle remplit `client_id` toute seule.
4. Dans le Dev Dashboard, ouvre l'app > **Paramètres** : copie le **Secret client** et ajoute-le dans Railway : variable `SHOPIFY_APP_SECRET` (ne le colle pas dans un chat).
5. Dans l'admin Shopify : **Paramètres > Comptes clients > Personnaliser** (éditeur « Paiement et comptes ») : onglet **Applications** > ajoute « Suivi atelier », puis ajoute un lien vers elle dans le menu de navigation du compte.
6. Installe l'app sur la boutique (Dev Dashboard > Installer).
