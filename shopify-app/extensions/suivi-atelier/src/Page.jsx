import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

// Adresse du logiciel atelier (API publique /pub/*).
const API = 'https://atelier-turnshop-production.up.railway.app';

export default async () => {
  render(<Page />, document.body);
};

const eur = (c) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const jour = (d) => {
  try { return new Date(d).toLocaleDateString('fr-FR', {day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris'}); } catch (e) { return ''; }
};

async function appel(chemin, corps) {
  const jwt = await shopify.sessionToken.get();
  const r = await fetch(API + chemin, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jwt, ...(corps || {})}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Une erreur est survenue, réessaie.');
  return j;
}
async function lire(chemin) {
  const r = await fetch(API + chemin);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Une erreur est survenue, réessaie.');
  return j;
}

// Prochains jours d'ouverture (mardi à samedi) pour le choix du créneau.
function prochainsJours() {
  const out = [];
  const d = new Date();
  for (let i = 1; out.length < 24 && i < 60; i++) {
    const x = new Date(d.getTime() + i * 86400000);
    const w = x.getDay();
    if (w >= 2 && w <= 6) {
      const iso = x.toISOString().slice(0, 10);
      out.push({iso, label: x.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'})});
    }
  }
  return out;
}

function Page() {
  const [vue, setVue] = useState('suivi');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [payUrl, setPayUrl] = useState('');

  const charge = () => appel('/pub/moi').then(setData).catch((e) => setMsg({err: true, texte: e.message}));
  useEffect(() => { charge(); }, []);

  const payer = async (id, mode) => {
    try {
      const j = await appel('/pub/payer', {repairId: id, mode});
      setPayUrl(j.url);
      try { shopify.navigation.navigate(j.url); } catch (e) { /* le bouton ci-dessous prend le relais */ }
    } catch (e) { setMsg({err: true, texte: e.message}); }
  };
  const repondre = async (id, reponse) => {
    try { const j = await appel('/pub/rdv/reponse', {repairId: id, reponse}); setMsg({err: false, texte: j.message}); await charge(); }
    catch (e) { setMsg({err: true, texte: e.message}); }
  };

  return (
    <s-page heading="Suivi atelier">
      <s-stack gap="base">
        {msg && <s-banner tone={msg.err ? 'critical' : 'success'} dismissible onDismiss={() => setMsg(null)}>{msg.texte}</s-banner>}
        {payUrl && <s-banner tone="info"><s-stack gap="small-200"><s-text>Ton paiement est prêt.</s-text><s-button variant="primary" href={payUrl}>Aller au paiement</s-button></s-stack></s-banner>}
        <s-stack direction="inline" gap="base">
          <s-button variant={vue === 'suivi' ? 'primary' : 'secondary'} onClick={() => setVue('suivi')}>Mes réparations</s-button>
          <s-button variant={vue === 'nouveau' ? 'primary' : 'secondary'} onClick={() => { setVue('nouveau'); setMsg(null); }}>Nouvelle demande</s-button>
        </s-stack>
        {vue === 'suivi'
          ? <Suivi data={data} payer={payer} repondre={repondre} nouveau={() => setVue('nouveau')} />
          : <Nouvelle onFait={async (j) => { setVue('suivi'); setMsg({err: false, texte: j.message + ' (' + j.numero + '). Pour engager ton rendez-vous, verse un acompte ci-dessous.'}); await charge(); }} payer={payer} setMsg={setMsg} />}
      </s-stack>
    </s-page>
  );
}

// ---------- Mes réparations ----------
function Frise({etapes}) {
  return (
    <s-stack direction="inline" gap="small-300">
      {(etapes || []).map((e) => (
        <s-badge key={e.k} tone={e.etat === 'fait' ? 'success' : e.etat === 'courant' ? 'info' : 'neutral'}>
          {(e.etat === 'fait' ? '✓ ' : e.etat === 'courant' ? '● ' : '○ ') + e.l}
        </s-badge>
      ))}
    </s-stack>
  );
}

function Carte({r, payer, repondre}) {
  const sp = (r.rdvSouhaite || '').split(' ');
  return (
    <s-section heading={r.trottinette}>
      <s-stack gap="base">
        <s-text color="subdued">{r.numero + (r.depot ? ' · déposée le ' + jour(r.depot) : '')}</s-text>
        <Frise etapes={r.etapes} />
        <s-text type="strong">{r.etat}</s-text>
        <s-text>{'Panne : ' + r.panne}</s-text>
        {r.rdvSouhaite && !r.rdv && <s-text>{'Créneau : ' + (/^\d{4}-\d{2}-\d{2}$/.test(sp[0]) ? jour(sp[0] + 'T12:00:00Z') : sp[0]) + (sp[1] ? ' (' + sp.slice(1).join(' ') + ')' : '') + (r.magasin ? ' à ' + r.magasin : '')}</s-text>}
        {r.rdv && <s-text>{'Rendez-vous : ' + jour(r.rdv) + (r.magasin ? ' (' + r.magasin + ')' : '')}</s-text>}
        {r.rdvStatut === 'propose' && (
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={() => repondre(r.id, 'accepter')}>Accepter ce créneau</s-button>
            <s-button onClick={() => repondre(r.id, 'annuler')}>Annuler ma demande</s-button>
          </s-stack>
        )}
        {r.devis.length > 0
          ? <s-stack gap="small-300">{r.devis.map((l, i) => <s-text key={i}>{l.quantite + ' × ' + l.libelle + ' : ' + (l.prixCents > 0 ? eur(l.quantite * l.prixCents) : 'prix à confirmer')}</s-text>)}</s-stack>
          : <s-text color="subdued">Le devis sera préparé par l'atelier.</s-text>}
        {r.remiseCents > 0 && <s-text>{'Remise plusieurs prestations : -' + eur(r.remiseCents)}</s-text>}
        {r.gardiennage && <s-text>{'Gardiennage : ' + eur(r.gardiennage.fraisCents)}</s-text>}
        {r.abandonnee && <s-banner tone="warning">Cette trottinette est considérée comme abandonnée.</s-banner>}
        {r.totalCents > 0 && <s-text type="strong">{'Total du devis : ' + eur(r.totalCents)}</s-text>}
        {r.verseCents > 0 && <s-text>{'Déjà versé : ' + eur(r.verseCents)}</s-text>}
        {r.verseCents > 0 && r.resteAPayerCents > 0 && <s-text>{'Reste à régler : ' + eur(r.resteAPayerCents)}</s-text>}
        {r.besoinBlocage && (
          <s-stack gap="small-200">
            <s-banner tone="info">{'Pour confirmer ton rendez-vous, un blocage de ' + eur(r.blocageCents) + ' est demandé. Le diagnostic est gratuit : ce montant est déduit de ta facture si tu fais réparer, gardé si tu ne viens pas, et remboursé si le devis ne te convient pas.'}</s-banner>
            <s-button variant="primary" onClick={() => payer(r.id, 'blocage')}>{'Bloquer mon rendez-vous (' + eur(r.blocageCents) + ')'}</s-button>
          </s-stack>
        )}
        {r.peutPayer && !r.abandonnee && (
          <s-stack gap="small-200">
            {r.verseCents === 0 && <s-text>Verse un acompte pour engager ton rendez-vous : il est déduit de ta facture.</s-text>}
            <s-stack direction="inline" gap="base">
              {r.verseCents === 0 && <s-button variant="primary" onClick={() => payer(r.id, 'acompte')}>Verser un acompte</s-button>}
              <s-button onClick={() => payer(r.id, 'total')}>{'Payer ' + eur(r.resteAPayerCents) + ' en ligne'}</s-button>
            </s-stack>
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}

function Suivi({data, payer, repondre, nouveau}) {
  if (!data) return <s-text>Chargement…</s-text>;
  const cours = data.reparations.filter((r) => r.groupe === 'cours');
  const finies = data.reparations.filter((r) => r.groupe === 'termine');
  return (
    <s-stack gap="base">
      {!data.reparations.length && <s-section><s-stack gap="base"><s-text>Tu n'as pas encore de réparation chez nous.</s-text><s-button variant="primary" onClick={nouveau}>Faire une demande</s-button></s-stack></s-section>}
      {cours.map((r) => <Carte key={r.id} r={r} payer={payer} repondre={repondre} />)}
      {finies.length > 0 && <s-heading>Réparations terminées</s-heading>}
      {finies.map((r) => <Carte key={r.id} r={r} payer={payer} repondre={repondre} />)}
    </s-stack>
  );
}

// ---------- Nouvelle demande ----------
function Nouvelle({onFait, payer, setMsg}) {
  const [marques, setMarques] = useState([]);
  const [marque, setMarque] = useState('');
  const [q, setQ] = useState('');
  const [modeles, setModeles] = useState([]);
  const [modele, setModele] = useState(null);
  const [libre, setLibre] = useState(false);
  const [marqueLibre, setMarqueLibre] = useState('');
  const [modeleLibre, setModeleLibre] = useState('');
  const [detail, setDetail] = useState(null);
  const [prestas, setPrestas] = useState({});
  const [options, setOptions] = useState({});
  const [pieces, setPieces] = useState({});
  const [panne, setPanne] = useState('');
  const [magasin, setMagasin] = useState('Amiens');
  const [date, setDate] = useState('');
  const [creneau, setCreneau] = useState('matin');
  const [envoi, setEnvoi] = useState(false);
  const jours = prochainsJours();

  useEffect(() => { lire('/pub/marques').then((j) => setMarques(j.marques)).catch(() => {}); }, []);
  useEffect(() => {
    if (!marque) return;
    lire('/pub/modeles?marque=' + encodeURIComponent(marque) + '&q=' + encodeURIComponent(q)).then((j) => setModeles(j.modeles)).catch(() => {});
  }, [marque, q]);

  const choisir = (m) => {
    setModele(m); setDetail(null); setPrestas({}); setPieces({}); setOptions({});
    lire('/pub/modeles/' + m.id).then(setDetail).catch((e) => setMsg({err: true, texte: e.message}));
  };
  const ids = (o) => Object.keys(o).filter((k) => o[k]).map(Number);
  const prestaChoisie = ids(prestas).length > 0, pieceChoisie = ids(pieces).length > 0;
  const total = !detail ? 0
    : detail.prestations.reduce((t, p) => t + (prestas[p.id] ? p.prixCents + (p.options || []).reduce((s, o) => s + (options[o.id] ? o.prixCents : 0), 0) : 0), 0)
      + detail.pieces.reduce((t, p) => t + (pieces[p.id] && p.prixCents ? p.prixCents : 0), 0);

  const envoyer = async () => {
    if (!date) { setMsg({err: true, texte: 'Choisis une date.'}); return; }
    const sansDevis = !prestaChoisie && !pieceChoisie;
    if (sansDevis && !panne.trim()) { setMsg({err: true, texte: 'Décris ta panne ou choisis une prestation.'}); return; }
    setEnvoi(true);
    try {
      const j = await appel('/pub/rdv', {modeleId: modele ? modele.id : null, marque: marqueLibre, modele: modeleLibre, magasin, date, creneau, panne, prestationIds: ids(prestas), optionIds: ids(options), pieceIds: ids(pieces)});
      if (sansDevis) { try { await payer(j.repairId, 'blocage'); } catch (e) { /* repli ci-dessous */ } }
      await onFait(j);
    } catch (e) { setMsg({err: true, texte: e.message}); setEnvoi(false); }
  };

  // Étape 1 : marque
  if (!marque && !libre) {
    return (
      <s-section heading="1. Ta trottinette">
        <s-stack gap="base">
          <s-text>Choisis la marque de ta trottinette.</s-text>
          <s-stack direction="inline" gap="small-200">
            {marques.map((m) => <s-button key={m} onClick={() => { setMarque(m); setQ(''); }}>{m}</s-button>)}
          </s-stack>
          <s-button onClick={() => setLibre(true)}>Autre marque</s-button>
        </s-stack>
      </s-section>
    );
  }
  // Étape 1 bis : modèle
  if (!modele && !libre) {
    return (
      <s-section heading={'1. Ton modèle ' + marque}>
        <s-stack gap="base">
          <s-text-field label="Filtrer les modèles" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
          <s-stack direction="inline" gap="small-200">
            {modeles.map((m) => <s-button key={m.id} onClick={() => choisir(m)}>{m.nom}</s-button>)}
          </s-stack>
          {!modeles.length && <s-text color="subdued">Aucun modèle trouvé.</s-text>}
          <s-stack direction="inline" gap="base">
            <s-button onClick={() => setMarque('')}>Autres marques</s-button>
            <s-button onClick={() => { setLibre(true); setMarqueLibre(marque); }}>Mon modèle n'est pas dans la liste</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    );
  }

  return (
    <s-stack gap="base">
      <s-section heading="1. Ta trottinette">
        <s-stack gap="base">
          {libre
            ? <s-stack direction="inline" gap="base">
                <s-text-field label="Marque" value={marqueLibre} onInput={(e) => setMarqueLibre(e.currentTarget.value)} />
                <s-text-field label="Modèle" value={modeleLibre} onInput={(e) => setModeleLibre(e.currentTarget.value)} />
              </s-stack>
            : <s-text type="strong">{modele.nom}</s-text>}
          <s-button onClick={() => { setModele(null); setLibre(false); setDetail(null); setMarque(''); }}>Changer de modèle</s-button>
        </s-stack>
      </s-section>

      {modele && !detail && <s-text color="subdued">Chargement des pièces compatibles…</s-text>}

      {detail && detail.prestations.length > 0 && (
        <s-section heading="2. Ce que tu veux faire">
          <s-stack gap="small-200">
            {detail.prestations.map((p) => (
              <s-stack key={p.id} gap="small-300">
                <s-checkbox label={p.nom + ' : ' + eur(p.prixCents) + (p.avecPiece ? ' (' + (p.aide || 'pièce') + ' à choisir ci-dessous)' : '')} checked={!!prestas[p.id]} onChange={(e) => setPrestas({...prestas, [p.id]: e.currentTarget.checked})} />
                {prestas[p.id] && (p.options || []).map((o) => (
                  <s-checkbox key={o.id} label={'Option : ' + o.nom + ' (+' + eur(o.prixCents) + ')'} checked={!!options[o.id]} onChange={(e) => setOptions({...options, [o.id]: e.currentTarget.checked})} />
                ))}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {detail && detail.pieces.length > 0 && (
        <s-section heading="Pièces compatibles avec ton modèle">
          <s-stack gap="small-200">
            {detail.pieces.map((p) => (
              <s-checkbox key={p.id} label={p.libelle + ' : ' + (p.prixCents ? eur(p.prixCents) : 'prix à confirmer') + (p.enStock === false ? ' · sur commande' : '')} checked={!!pieces[p.id]} onChange={(e) => setPieces({...pieces, [p.id]: e.currentTarget.checked})} />
            ))}
          </s-stack>
        </s-section>
      )}

      <s-section heading="3. Décris ton besoin">
        <s-text-area label="Panne ou demande (facultatif si tu as choisi une prestation)" rows="3" value={panne} onInput={(e) => setPanne(e.currentTarget.value)} />
      </s-section>

      <s-section heading="4. Rendez-vous">
        <s-stack gap="base">
          <s-select label="Atelier" value={magasin} onChange={(e) => setMagasin(e.currentTarget.value)}>
            <s-option value="Amiens">Amiens (mar-sam)</s-option>
            <s-option value="Rouen">Rouen (mar-sam)</s-option>
          </s-select>
          <s-select label="Date souhaitée (du mardi au samedi)" value={date} onChange={(e) => setDate(e.currentTarget.value)}>
            <s-option value="">Choisis une date</s-option>
            {jours.map((j) => <s-option key={j.iso} value={j.iso}>{j.label}</s-option>)}
          </s-select>
          <s-select label="Moment de la journée" value={creneau} onChange={(e) => setCreneau(e.currentTarget.value)}>
            <s-option value="matin">Matin</s-option>
            <s-option value="apres-midi">Après-midi</s-option>
          </s-select>
          {!prestaChoisie && !pieceChoisie && <s-banner tone="info">Panne à diagnostiquer : un blocage de rendez-vous de 20 € est demandé à la fin. Le diagnostic est gratuit, le montant est déduit de ta facture si tu fais réparer, gardé si tu ne viens pas, et remboursé si le devis ne te convient pas.</s-banner>}
          {total > 0 && <s-text type="strong">{'Total estimé : ' + eur(total)}</s-text>}
          <s-text color="subdued">Le devis est confirmé par l'atelier. Tu pourras régler en ligne depuis « Mes réparations ».</s-text>
          <s-button variant="primary" loading={envoi} onClick={envoyer}>Envoyer ma demande</s-button>
        </s-stack>
      </s-section>
    </s-stack>
  );
}
