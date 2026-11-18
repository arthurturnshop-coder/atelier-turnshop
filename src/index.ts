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
import "./routes/diagnostic";
import "./routes/ticket";
import "./routes/achats";
import "./routes/commandes";
import "./routes/caisse";
import { HTML } from "./page";

app.get("/", (c) => c.html(HTML));

export default { port: Number(Bun.env.PORT ?? 3000), fetch: app.fetch };
