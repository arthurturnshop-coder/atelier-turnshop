import { app } from "./app";
// L'ordre compte : auth.ts installe la protection /api/* avant toutes les routes /api.
import "./routes/auth";
import "./routes/clients";
import "./routes/reparations";
import "./routes/planning";
import "./routes/consignes";
import "./routes/parametres";
import "./routes/avantages";
import "./routes/prestations";
import "./routes/modeles";
import "./routes/pub";
import "./routes/taches";
import "./routes/brevo";
import "./routes/diagnostic";
import "./routes/ticket";
import "./routes/achats";
import "./routes/stock";
import "./routes/commandes";
import "./routes/acomptes";
import "./routes/rdv";
import "./routes/caisse";
import "./automatisations";
import { HTML } from "./page";

app.get("/", (c) => c.html(HTML));

export default { port: Number(Bun.env.PORT ?? 3000), fetch: app.fetch };
