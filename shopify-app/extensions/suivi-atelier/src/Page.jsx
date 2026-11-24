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
      return true;
    } catch (e) { setMsg({err: true, texte: e.message}); return false; }
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
          : <Nouvelle profil={data ? data.profil : null} onFait={async (j, paye) => { setVue('suivi'); if (!paye) setMsg({err: false, texte: 'Ton rendez-vous (' + j.numero + ') n\'est pas encore envoyé à l\'atelier : clique sur "Finaliser mon rdv" ci-dessous pour le régler.'}); await charge(); }} payer={payer} setMsg={setMsg} />}
      </s-stack>
    </s-page>
  );
}

// ---------- Mes réparations ----------
const AUTOS = [
  {cle: 'freins', l: 'Freins'},
  {cle: 'pneus', l: 'Pneus et chambres à air'},
  {cle: 'eclairage', l: 'Éclairage'},
  {cle: 'cables', l: 'Câbles et connectique'},
  {cle: 'serrage', l: 'Contrôle sécurité et serrage général'},
];

function Frise({etapes}) {
  // Un seul badge : l'étape en cours (ou la dernière faite si tout est terminé).
  const liste = etapes || [];
  const cur = liste.filter((e) => e.etat === 'courant');
  const faits = liste.filter((e) => e.etat === 'fait');
  const vue = cur.length ? cur : faits.length ? [faits[faits.length - 1]] : liste.slice(0, 1);
  return (
    <s-stack direction="inline" gap="small-300">
      {vue.map((e) => (
        <s-badge key={e.k} tone={e.etat === 'fait' ? 'success' : e.etat === 'courant' ? 'info' : 'neutral'}>
          {(e.etat === 'fait' ? '✓ ' : e.etat === 'courant' ? '● ' : '○ ') + e.l}
        </s-badge>
      ))}
    </s-stack>
  );
}

function Carte({r, payer, repondre}) {
  const sp = (r.rdvSouhaite || '').split(' ');
  const [detailOuvert, setDetailOuvert] = useState(false);
  return (
    <s-section heading={r.trottinette}>
      <s-stack gap="base">
        <s-text color="subdued">{r.numero + (r.depot ? ' · déposée le ' + jour(r.depot) : '')}</s-text>
        <Frise etapes={r.etapes} />
        <s-text type="strong">{r.etat}</s-text>
        {r.totalCents > 0 && <s-text>{(r.facturee ? 'Total facturé : ' : 'Total du devis : ') + eur(r.totalCents)}</s-text>}
        <s-button variant="secondary" onClick={() => setDetailOuvert(!detailOuvert)}>{detailOuvert ? 'Masquer la fiche' : 'Voir la fiche complète'}</s-button>
        {detailOuvert && (
          <s-stack gap="small-300">
            <s-text>{'Panne : ' + r.panne}</s-text>
            {r.etatDepot && <s-text>{'État à la réception : ' + r.etatDepot}</s-text>}
            {(r.autorisations || []).length > 0 && (
              <s-stack gap="small-300">
                <s-text type="strong">Ce que tu as autorisé à l'atelier</s-text>
                {r.autorisations.map((x, i) => <s-text key={i}>{'• ' + x}</s-text>)}
                <s-text color="subdued">Si on change une pièce en plus, on t'envoie une extension de devis que tu valides avant tout.</s-text>
              </s-stack>
            )}
            {r.devis.map((l, i) => <s-text key={i}>{l.quantite + ' × ' + l.libelle + ' : ' + (l.prixCents > 0 ? eur(l.quantite * l.prixCents) : 'prix à confirmer')}</s-text>)}
            {r.devis.length === 0 && <s-text color="subdued">Le devis sera préparé par l'atelier.</s-text>}
          </s-stack>
        )}
        {r.rdvSouhaite && !r.rdv && <s-text>{'Créneau : ' + (/^\d{4}-\d{2}-\d{2}$/.test(sp[0]) ? jour(sp[0] + 'T12:00:00Z') : sp[0]) + (sp[1] ? ' (' + sp.slice(1).join(' ') + ')' : '') + (r.magasin ? ' à ' + r.magasin : '')}</s-text>}
        {r.rdv && <s-text>{'Rendez-vous : ' + jour(r.rdv) + (r.magasin ? ' (' + r.magasin + ')' : '')}</s-text>}
        {r.rdvStatut === 'propose' && (
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={() => repondre(r.id, 'accepter')}>Accepter ce créneau</s-button>
            <s-button onClick={() => repondre(r.id, 'annuler')}>Annuler ma demande</s-button>
          </s-stack>
        )}
        {r.remiseCents > 0 && <s-text>{'Remise plusieurs prestations : -' + eur(r.remiseCents)}</s-text>}
        {r.gardiennage && (
          <s-banner tone="critical" heading="Gardiennage en cours">
            <s-text type="strong">{'Gardiennage : ' + eur(r.gardiennage.fraisCents) + (r.gardiennage.jours ? ' (' + r.gardiennage.jours + ' jours)' : '') + ' — Venez la chercher le plus rapidement possible, les frais augmentent chaque jour.'}</s-text>
          </s-banner>
        )}
        {r.abandonnee && <s-banner tone="warning">Cette trottinette est considérée comme abandonnée.</s-banner>}
        {r.verseCents > 0 && <s-text>{'Déjà versé : ' + eur(r.verseCents)}</s-text>}
        {r.verseCents > 0 && r.resteAPayerCents > 0 && <s-text>{'Reste à régler : ' + eur(r.resteAPayerCents)}</s-text>}
        {r.factureLien && <s-button variant="secondary" href={r.factureLien} target="_blank">Voir ma facture</s-button>}
        {r.devisLien && (
          <s-stack gap="small-200">
            <s-banner tone="info">Ton devis est prêt : consulte-le, accepte-le ou refuse-le.</s-banner>
            <s-button variant="primary" href={r.devisLien} target="_blank">Voir et accepter mon devis</s-button>
          </s-stack>
        )}
        {r.aFinaliser && (
          <s-stack gap="small-200">
            <s-banner tone="warning">
              <s-stack gap="small-200">
                <s-text type="strong">Ton rendez-vous n'est pas encore envoyé à l'atelier</s-text>
                <s-text>{'Règle ' + (r.totalCents > 0 ? 'l\'acompte' : 'le blocage de ' + eur(r.blocageCents)) + ' pour finaliser ta demande. Tant que ce n\'est pas payé, l\'atelier ne voit rien. Remboursé si l\'atelier refuse ou ne peut pas te recevoir.'}</s-text>
              </s-stack>
            </s-banner>
            <s-button variant="primary" onClick={() => payer(r.id, r.totalCents > 0 ? 'acompte' : 'blocage')}>Finaliser mon rdv</s-button>
          </s-stack>
        )}
        {r.besoinBlocage && !r.aFinaliser && (
          <s-stack gap="small-200">
            <s-banner tone="info">{'Pour confirmer ton rendez-vous, un blocage de ' + eur(r.blocageCents) + ' est demandé. Le diagnostic est gratuit : ce montant est déduit de ta facture si tu fais réparer, gardé si tu ne viens pas, et remboursé si le devis ne te convient pas.'}</s-banner>
            <s-button variant="primary" onClick={() => payer(r.id, 'blocage')}>{'Bloquer mon rendez-vous (' + eur(r.blocageCents) + ')'}</s-button>
          </s-stack>
        )}
        {r.peutPayer && !r.aFinaliser && !r.abandonnee && (
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
function Nouvelle({onFait, payer, setMsg, profil}) {
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
  const [autos, setAutos] = useState({});
  const [magasin, setMagasin] = useState('Amiens');
  const [date, setDate] = useState('');
  const [creneau, setCreneau] = useState('matin');
  const [envoi, setEnvoi] = useState(false);
  const [prenom, setPrenom] = useState((profil && profil.prenom) || '');
  const [nom, setNom] = useState((profil && profil.nom) || '');
  const [tel, setTel] = useState((profil && profil.tel) || '');
  const [email, setEmail] = useState((profil && profil.email) || '');
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

  const [erreurs, setErreurs] = useState({});
  const [fait, setFait] = useState(null);
  const envoyer = async () => {
    const sansDevis = !prestaChoisie && !pieceChoisie;
    const er = {};
    if (sansDevis && !panne.trim()) er.panne = 'Décris ta panne ou choisis une prestation.';
    if (!prenom.trim()) er.prenom = 'Indique ton prénom.';
    if (!nom.trim()) er.nom = 'Indique ton nom.';
    if (tel.replace(/\D/g, '').length < 9) er.tel = 'Indique un numéro de portable valide.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) er.email = 'Indique une adresse email valide.';
    if (!date) er.date = 'Choisis une date.';
    setErreurs(er);
    if (Object.keys(er).length) { setMsg({err: true, texte: 'Il manque des informations : les champs en rouge sont à compléter.'}); return; }
    setMsg(null);
    setEnvoi(true);
    try {
      const j = await appel('/pub/rdv', {prenom, nom, tel, email, modeleId: modele ? modele.id : null, marque: marqueLibre, modele: modeleLibre, magasin, date, creneau, panne, autorisations: Object.keys(autos).filter((k) => autos[k]).map((k) => ({cle: k, mode: autos[k]})), prestationIds: ids(prestas), optionIds: ids(options), pieceIds: ids(pieces)});
      setFait({j, sansDevis});
      setEnvoi(false);
    } catch (e) { setMsg({err: true, texte: e.message}); setEnvoi(false); }
  };
  // Paiement obligatoire pour engager le rendez-vous : acompte si devis, blocage sinon (remboursable si besoin).
  const confirmer = async () => {
    setEnvoi(true);
    let paye = await payer(fait.j.repairId, fait.sansDevis ? 'blocage' : 'acompte');
    if (!paye) paye = await payer(fait.j.repairId, fait.sansDevis ? 'acompte' : 'blocage');
    setEnvoi(false);
    await onFait(fait.j, paye);
  };

  // Après l'envoi : explications + confirmation (paiement) du rendez-vous
  if (fait) {
    const adresse = magasin === 'Rouen' ? "5 bis rue d'Harcourt, 76000 Rouen" : '6 rue de la 2e DB, Amiens';
    return (
      <s-section heading={'Dernière étape : finalise ton rendez-vous (' + fait.j.numero + ')'}>
        <s-stack gap="base">
          <s-text>{'Rendez-vous souhaité : ' + (jours.find((x) => x.iso === date) || {label: date}).label + ' (' + (creneau === 'matin' ? 'matin' : 'après-midi') + ').'}</s-text>
          <s-text>Ton rendez-vous a bien été pris en compte, notre équipe va revenir vers toi pour finaliser l'horaire. Regarde régulièrement sur ton profil pour te tenir informé.</s-text>
          <s-text>Une fois ton rendez-vous finalisé, tu déposes ta trottinette en présentant le QR code de ta carte de fidélité. On s'occupe du reste !</s-text>
          <s-text type="strong">{'Atelier : ' + adresse}</s-text>
          <s-banner tone="info">
            <s-stack gap="small-200">
              <s-text type="strong">Ta demande n'est envoyée à l'atelier qu'après paiement</s-text>
              <s-text>{fait.sansDevis
                ? 'Un blocage de ' + eur(2000) + ' est demandé en ligne. Le diagnostic est gratuit : ce montant est déduit de ta facture si tu fais réparer, gardé si tu ne viens pas au rendez-vous.'
                : 'Un acompte est demandé en ligne. Il est déduit de ta facture finale et gardé si tu ne viens pas au rendez-vous.'}</s-text>
              <s-text>Si l'atelier refuse ou ne peut pas te recevoir, tu es remboursé.</s-text>
            </s-stack>
          </s-banner>
          <s-button variant="primary" loading={envoi} onClick={confirmer}>Je confirme ma prise de RDV</s-button>
        </s-stack>
      </s-section>
    );
  }
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
        <s-section heading="Choisis ta pièce">
          <s-stack gap="base">
            <s-text color="subdued">Touche un produit pour l'ajouter à ta demande. Le prix est celui de la boutique.</s-text>
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              {detail.pieces.map((p) => (
                <s-box key={p.id} border={pieces[p.id] ? 'large' : 'base'} padding="base">
                  <s-stack gap="small-200">
                    {p.image ? <s-image src={p.image} alt={p.titre} aspectRatio="1/1" objectFit="contain" /> : null}
                    {p.marque ? <s-text color="subdued">{p.marque}</s-text> : null}
                    <s-text type="strong">{p.titre}</s-text>
                    <s-text>{p.prixCents ? eur(p.prixCents) : 'Prix à confirmer'}</s-text>
                    {p.enStock === false ? <s-badge>Sur commande</s-badge> : null}
                    <s-button variant={pieces[p.id] ? 'primary' : 'secondary'} onClick={() => setPieces({...pieces, [p.id]: !pieces[p.id]})}>{pieces[p.id] ? 'Choisi ✓' : 'Choisir'}</s-button>
                  </s-stack>
                </s-box>
              ))}
            </s-grid>
          </s-stack>
        </s-section>
      )}

      <s-section heading="3. Décris ton besoin">
        <s-text-area label="Panne ou demande (facultatif si tu as choisi une prestation)" rows="3" value={panne} error={erreurs.panne} onInput={(e) => setPanne(e.currentTarget.value)} />
      </s-section>

      <s-section heading="Pendant qu'on y est (facultatif)">
        <s-stack gap="base">
          <s-text color="subdued">Gagne du temps : dis-nous ce qu'on peut faire sans te rappeler. Tout changement de pièce passe par une extension de devis que tu valides avant.</s-text>
          {AUTOS.map((a) => (
            <s-select key={a.cle} label={a.l} value={autos[a.cle] || ''} onChange={(e) => setAutos({...autos, [a.cle]: e.currentTarget.value})}>
              <s-option value="">Rien de plus</s-option>
              <s-option value="verifier">Vérifier et me prévenir</s-option>
              <s-option value="changer">Changer si nécessaire (sur devis)</s-option>
            </s-select>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="4. Tes coordonnées">
        <s-stack gap="base">
          <s-text-field label="Prénom" value={prenom} error={erreurs.prenom} onInput={(e) => setPrenom(e.currentTarget.value)} />
          <s-text-field label="Nom" value={nom} error={erreurs.nom} onInput={(e) => setNom(e.currentTarget.value)} />
          <s-text-field label="Portable" value={tel} error={erreurs.tel} onInput={(e) => setTel(e.currentTarget.value)} />
          <s-text-field label="Email" value={email} error={erreurs.email} onInput={(e) => setEmail(e.currentTarget.value)} />
        </s-stack>
      </s-section>

      <s-section heading="5. Rendez-vous">
        <s-stack gap="base">
          <s-select label="Atelier" value={magasin} onChange={(e) => setMagasin(e.currentTarget.value)}>
            <s-option value="Amiens">Amiens (mar-sam)</s-option>
            <s-option value="Rouen">Rouen (mar-sam)</s-option>
          </s-select>
          <s-select label="Date souhaitée (du mardi au samedi)" value={date} error={erreurs.date} onChange={(e) => setDate(e.currentTarget.value)}>
            <s-option value="">Choisis une date</s-option>
            {jours.map((j) => <s-option key={j.iso} value={j.iso}>{j.label}</s-option>)}
          </s-select>
          <s-select label="Moment de la journée" value={creneau} onChange={(e) => setCreneau(e.currentTarget.value)}>
            <s-option value="matin">Matin</s-option>
            <s-option value="apres-midi">Après-midi</s-option>
          </s-select>
          {!prestaChoisie && !pieceChoisie && <s-banner tone="info">Panne à diagnostiquer : un blocage de rendez-vous de 20 € est demandé à la fin. Le diagnostic est gratuit, le montant est déduit de ta facture si tu fais réparer, gardé si tu ne viens pas, et remboursé si le devis ne te convient pas.</s-banner>}
          {total > 0 && <s-text type="strong">{'Total estimé : ' + eur(total)}</s-text>}
          <s-text color="subdued">Un acompte est à régler en ligne juste après l'envoi pour engager le rendez-vous. Il est déduit de ta facture et remboursé si l'atelier ne peut pas te recevoir.</s-text>
          <s-button variant="primary" loading={envoi} onClick={envoyer}>Envoyer ma demande</s-button>
        </s-stack>
      </s-section>
    </s-stack>
  );
}
