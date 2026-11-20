// Assemble la page HTML (une seule chaîne) à partir des petits morceaux de src/page/.
import { SHELL } from "./page/shell";
import { BASE } from "./page/base";
import { LOGIN } from "./page/login";
import { PROFIL } from "./page/profil";
import { DASHBOARD } from "./page/dashboard";
import { ATELIER } from "./page/atelier";
import { CAISSE } from "./page/caisse";
import { PARAMETRES } from "./page/parametres";
import { ACTIONS } from "./page/actions";
import { RECHERCHE } from "./page/recherche";
import { PLANNING } from "./page/planning";
import { IMPRESSION } from "./page/impression";
import { STATS } from "./page/stats";
import { RETOURS } from "./page/retours";
import { GARANTIE } from "./page/garantie";
import { CREATION } from "./page/creation";
import { CLIENT } from "./page/client";
import { DEVIS } from "./page/devis";
import { COMMANDES } from "./page/commandes";
import { STOCK } from "./page/stock";
import { COMPTA } from "./page/compta";

// L'ordre compte : c'est l'ordre d'exécution du script dans le navigateur.
export const HTML = [
  SHELL, BASE, LOGIN, PROFIL, DASHBOARD, ATELIER, CAISSE, PARAMETRES, ACTIONS, RECHERCHE, COMMANDES, STOCK, COMPTA, PLANNING, IMPRESSION, STATS, RETOURS, GARANTIE, CREATION, CLIENT, DEVIS,
  "render();",
  "</script></body></html>",
].join("\n");
