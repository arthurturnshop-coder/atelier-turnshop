// Restauration : DATABASE_URL=... bun scripts/restore.ts sauvegarde-fs-XXXX.json.gz
// ATTENTION : vide puis remplit les tables présentes dans la sauvegarde. À lancer sur une base dont le schéma existe déjà
// (démarre une fois l'application sur la base cible pour créer les tables, puis lance ce script).
import { SQL } from "bun";
const fichier = process.argv[2];
if (!fichier || !Bun.env.DATABASE_URL) { console.log("Usage : DATABASE_URL=postgres://... bun scripts/restore.ts fichier.json.gz"); process.exit(1); }
const sql = new SQL(Bun.env.DATABASE_URL);
const dump = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await Bun.file(fichier).arrayBuffer()))));
await sql.begin(async (tx: any) => {
  await tx.unsafe("SET session_replication_role = replica"); // ignore les clés étrangères pendant le chargement
  const noms = Object.keys(dump.tables).filter((n) => /^[a-z0-9_]+$/i.test(n));
  await tx.unsafe(`TRUNCATE ${noms.map((n) => '"' + n + '"').join(", ")} RESTART IDENTITY CASCADE`); // tout vider d'abord, puis tout remplir
  for (const [nom, lignes] of Object.entries<any[]>(dump.tables)) {
    if (!/^[a-z0-9_]+$/i.test(nom)) continue;
    if (!lignes.length) continue;
    await tx.unsafe(`INSERT INTO "${nom}" SELECT * FROM jsonb_populate_recordset(NULL::"${nom}", $1::text::jsonb)`, [JSON.stringify(lignes)]);
    const aId = (await tx.unsafe(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${nom}' AND column_name = 'id'`)).length > 0;
    const seq = aId ? (await tx.unsafe(`SELECT pg_get_serial_sequence('"${nom}"', 'id') AS s`))[0]?.s : null;
    if (seq) await tx.unsafe(`SELECT setval('${seq}', GREATEST((SELECT COALESCE(max(id), 1) FROM "${nom}"), 1))`);
    console.log(nom, lignes.length);
  }
});
console.log("Restauration terminée (sauvegarde du", dump.date + ")");
process.exit(0);
