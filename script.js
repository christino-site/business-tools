"use strict";

/* =====================================================================
   Business Tools – 100 % navigateur, JavaScript vanilla, zéro dépendance
   Sections : 1. Utilitaires  2. Navigation  3. Calculateur
              4. Facture & devis  5. Générateur WhatsApp  6. Démarrage
   ===================================================================== */

/* ---------- 1. Utilitaires ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Convertit une saisie en nombre (accepte la virgule). NaN si vide ou invalide. */
function toNum(value) {
  const s = String(value).trim().replace(',', '.');
  return s === '' ? NaN : Number(s);
}

/** Format français : 1250000 → "1 250 000", 37.5 → "37,5" (espaces insécables). */
function fmt(n, decimals = 2) {
  if (!Number.isFinite(n)) return '—';
  const r = Number(Math.abs(n).toFixed(decimals));
  const [int, dec] = String(r).split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return (n < 0 && r !== 0 ? '-' : '') + spaced + (dec ? ',' + dec : '');
}
const fcfa = (n) => fmt(n) + '\u00A0FCFA';
const pct = (n) => (Number.isFinite(n) ? fmt(n, 1) + '\u00A0%' : '—');

/* ---------- 2. Navigation (Accueil → outil → Accueil) ---------- */
const VIEWS = ['home', 'calc', 'invoice', 'whatsapp'];

function route(moveFocus = true) {
  const requested = location.hash.slice(1);
  const view = VIEWS.includes(requested) ? requested : 'home';
  $$('.view').forEach((section) => { section.hidden = section.id !== 'view-' + view; });
  $('#homeBtn').hidden = view === 'home';
  window.scrollTo(0, 0);
  const title = $('#view-' + view + ' h1');
  if (moveFocus && title) title.focus({ preventScroll: true });
}

$$('[data-go]').forEach((btn) => btn.addEventListener('click', () => { location.hash = btn.dataset.go; }));
window.addEventListener('hashchange', () => route());

/* ---------- 3. Calculateur de bénéfice ---------- */
const REQUIRED_CALC = {
  buy: "Veuillez saisir un prix d'achat.",
  qty: 'Veuillez saisir une quantité supérieure à 0.',
  sell: 'Veuillez saisir un prix de vente.',
};

/** Recalcule et affiche les résultats. Retourne true si les champs obligatoires sont valides. */
function updateCalc(forceErrors = false) {
  const buy = toNum($('#buy').value);
  const qty = toNum($('#qty').value);
  const sell = toNum($('#sell').value);
  const invalid = {
    buy: !(buy >= 0),
    qty: !(qty > 0),
    sell: !(sell >= 0),
  };

  Object.keys(REQUIRED_CALC).forEach((id) => {
    const input = $('#' + id);
    const show = invalid[id] && (forceErrors || input.dataset.touched);
    $('#' + id + '-err').textContent = show ? REQUIRED_CALC[id] : '';
    input.setAttribute('aria-invalid', show ? 'true' : 'false');
  });

  const valid = !invalid.buy && !invalid.qty && !invalid.sell;
  $('#resEmpty').hidden = valid;
  $('#resBody').hidden = !valid;
  if (!valid) return false;

  // Autres coûts : un champ vide compte pour 0
  const extras = $$('.cost').reduce((sum, el) => sum + Math.max(0, toNum(el.value) || 0), 0);

  const productCost = buy * qty;               // prix d'achat × quantité
  const totalCost = productCost + extras;      // + transport, douane, pub, emballage, livraison, autres
  const revenue = sell * qty;                  // prix de vente × quantité
  const profit = revenue - totalCost;          // chiffre d'affaires − coût total
  const unitCost = totalCost / qty;            // coût total ÷ quantité
  const unitProfit = profit / qty;             // bénéfice ÷ quantité
  const margin = revenue > 0 ? (profit / revenue) * 100 : NaN; // bénéfice ÷ CA × 100

  $('#rProducts').textContent = fcfa(productCost);
  $('#rTotal').textContent = fcfa(totalCost);
  $('#rRevenue').textContent = fcfa(revenue);
  $('#rProfit').textContent = fcfa(profit);
  $('#rMargin').textContent = pct(margin);
  $('#rUnitCost').textContent = fcfa(unitCost);
  $('#rUnitProfit').textContent = fcfa(unitProfit);
  $('#resProduct').textContent = $('#pname').value.trim() ? 'Produit : ' + $('#pname').value.trim() : '';

  const state = profit < 0 ? 'neg' : profit > 0 ? 'pos' : 'zero';
  const verdict = $('#verdict');
  verdict.className = 'verdict ' + state;
  verdict.textContent = {
    neg: '⚠️ Attention : vous perdez de l\'argent sur cette vente.',
    pos: '✅ Votre vente est rentable.',
    zero: 'Vous êtes à l\'équilibre : ni bénéfice, ni perte.',
  }[state];
  ['#statProfit', '#statMargin'].forEach((sel) => { $(sel).className = 'stat ' + (state === 'zero' ? '' : state); });
  return true;
}

$('#calcForm').addEventListener('input', () => updateCalc());
$$('#calcForm input').forEach((input) => input.addEventListener('blur', () => {
  input.dataset.touched = '1';
  updateCalc();
}));
$('#calcReset').addEventListener('click', () => {
  $('#calcForm').reset();
  $$('#calcForm input').forEach((i) => delete i.dataset.touched);
  updateCalc();
});
$('#calcPrint').addEventListener('click', () => {
  if (updateCalc(true)) window.print();
  else $('#calcForm [aria-invalid="true"]').focus();
});

/* ---------- 4. Facture & devis ---------- */
let logoUrl = null;

const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const frDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

function addLine() {
  $('#lines').append($('#lineTpl').content.cloneNode(true));
  renderInvoice();
}

/** Lit les lignes du formulaire (sans effet de bord). */
function readLines() {
  return $$('.line').map((el) => {
    const qty = toNum($('.l-qty', el).value);
    const price = toNum($('.l-price', el).value);
    const q = Number.isFinite(qty) ? qty : 0;
    const p = Number.isFinite(price) ? price : 0;
    return { el, name: $('.l-name', el).value.trim(), qty: q, price: p, total: q * p };
  });
}

/** Met à jour l'aperçu du document et tous les totaux. */
function renderInvoice() {
  const isQuote = $('input[name="docType"]:checked').value === 'devis';
  $('#pTitle').textContent = isQuote ? 'DEVIS' : 'FACTURE';

  // Texte brut uniquement (textContent) : rien n'est interprété comme du HTML
  const setText = (id, value) => { const el = $('#' + id); el.textContent = value; el.hidden = !value; };
  const val = (id) => $('#' + id).value.trim();
  setText('pName', val('sName'));
  setText('pPhone', val('sPhone') && 'Tél. : ' + val('sPhone'));
  setText('pAddr', val('sAddr'));
  setText('pNote', val('sNote'));
  setText('pcName', val('cName'));
  setText('pcPhone', val('cPhone') && 'Tél. : ' + val('cPhone'));
  setText('pcAddr', val('cAddr'));
  $('#pNum').textContent = val('dNum');
  $('#pDate').textContent = frDate($('#dDate').value);

  const lines = readLines();
  lines.forEach((l) => { $('.l-total strong', l.el).textContent = fcfa(l.total); });
  $('#pRows').replaceChildren(...lines.filter((l) => l.name || l.total).map((l) => {
    const tr = document.createElement('tr');
    [l.name, fmt(l.qty), fcfa(l.price), fcfa(l.total)].forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (i > 0) td.className = 'num';
      tr.append(td);
    });
    return tr;
  }));

  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const requested = Math.max(0, toNum($('#discount').value) || 0);
  const discount = Math.min(requested, subtotal);
  const shipping = Math.max(0, toNum($('#shipping').value) || 0);
  $('#discErr').textContent = requested > subtotal ? 'La réduction dépasse le sous-total : elle est limitée à ' + fcfa(subtotal) + '.' : '';

  $('#pSub').textContent = fcfa(subtotal);
  $('#pDisc').textContent = discount > 0 ? '-' + fcfa(discount) : fcfa(0);
  $('#pShip').textContent = fcfa(shipping);
  $('#pTotal').textContent = fcfa(subtotal - discount + shipping);
}

function setLogo(file) {
  const msg = $('#logoMsg');
  msg.textContent = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { msg.textContent = 'Le fichier choisi n\'est pas une image.'; $('#logoInput').value = ''; return; }
  if (file.size > 3 * 1024 * 1024) { msg.textContent = 'Image trop lourde (3 Mo maximum).'; $('#logoInput').value = ''; return; }
  if (logoUrl) URL.revokeObjectURL(logoUrl);
  logoUrl = URL.createObjectURL(file); // reste local : aucune donnée envoyée
  $('#pLogo').src = logoUrl;
  $('#pLogo').hidden = false;
  $('#logoRemove').hidden = false;
}

function removeLogo() {
  if (logoUrl) URL.revokeObjectURL(logoUrl);
  logoUrl = null;
  $('#pLogo').removeAttribute('src');
  $('#pLogo').hidden = true;
  $('#logoRemove').hidden = true;
  $('#logoInput').value = '';
  $('#logoMsg').textContent = '';
}

$('#invForm').addEventListener('input', renderInvoice);
$('#addLine').addEventListener('click', addLine);
$('#logoInput').addEventListener('change', (e) => setLogo(e.target.files[0]));
$('#logoRemove').addEventListener('click', removeLogo);

$('#lines').addEventListener('click', (e) => {
  const btn = e.target.closest('.l-del');
  if (!btn) return;
  const line = btn.closest('.line');
  if ($$('.line').length > 1) {
    line.remove();
  } else { // dernière ligne : on la vide au lieu de la supprimer
    $('.l-name', line).value = '';
    $('.l-qty', line).value = '1';
    $('.l-price', line).value = '';
  }
  renderInvoice();
});

$$('input[name="docType"]').forEach((radio) => radio.addEventListener('change', () => {
  const prefix = radio.value === 'devis' ? 'DEV' : 'FAC';
  const num = $('#dNum');
  if (!num.value.trim()) num.value = prefix + '-001';
  else if (/^(FAC|DEV)-/.test(num.value)) num.value = prefix + num.value.slice(3);
  renderInvoice();
}));

$('#invPrint').addEventListener('click', () => {
  const missing = [];
  if (!$('#sName').value.trim()) missing.push('le nom ou l\'entreprise du vendeur');
  if (!$('#cName').value.trim()) missing.push('le nom du client');
  if (!readLines().some((l) => l.name && l.total > 0)) missing.push('au moins un produit (désignation, quantité et prix)');
  const box = $('#invErr');
  box.textContent = missing.length ? 'Veuillez renseigner : ' + missing.join(', ') + '.' : '';
  box.hidden = missing.length === 0;
  if (!missing.length) window.print();
});

/* ---------- 5. Générateur de messages WhatsApp ---------- */
const field = (id, label, opts = {}) => ({ id, label, ...opts });
const money = (v) => { const n = toNum(v); return Number.isFinite(n) ? (fmt(n) + ' FCFA').replace(/\u00A0/g, ' ') : ''; };
const hi = (v) => 'Bonjour' + (v.client ? ' ' + v.client : '') + ' 👋';
const ln = (label, value) => (value ? label + ' : ' + value : null);
/** Assemble les lignes (null ignoré) et évite les trop longs blancs. */
const compose = (...parts) => parts.filter((p) => p !== null && p !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();

const CATEGORIES = {
  contact: {
    label: '👋 Premier contact',
    fields: [field('client', 'Nom du client', { req: true }), field('entreprise', 'Votre nom ou entreprise', { req: true }), field('offre', 'Ce que vous proposez')],
    build: (v) => compose(hi(v), '', 'Ici ' + v.entreprise + '.', v.offre ? 'Nous proposons : ' + v.offre + '.' : null, '', 'Dites-moi ce qui vous intéresse, je vous réponds avec plaisir.', '', 'Bonne journée 🙏'),
  },
  prix: {
    label: '💰 Demande de prix',
    fields: [field('client', 'Nom du client', { req: true }), field('produit', 'Produit', { req: true }), field('prix', 'Prix (FCFA)', { req: true, type: 'number' }), field('validite', 'Offre valable jusqu\'au')],
    build: (v) => compose(hi(v), '', 'Merci pour votre intérêt.', '', ln('Produit', v.produit), ln('Prix', money(v.prix)), ln('Valable jusqu\'au', v.validite), '', 'Souhaitez-vous commander ? Je reste disponible pour toute question.'),
  },
  commande: {
    label: '🛒 Confirmation de commande',
    fields: [field('client', 'Nom du client', { req: true }), field('produit', 'Produit', { req: true }), field('quantite', 'Quantité', { type: 'number' }), field('prix', 'Montant total (FCFA)', { type: 'number' }), field('livraison', 'Date et heure de livraison', { placeholder: '8 octobre à 8H' }), field('paiement', 'Moyen de paiement')],
    build: (v) => compose(hi(v), '', 'Merci pour votre commande.', '', ln('Produit', v.produit), ln('Quantité', v.quantite), ln('Montant', money(v.prix)), ln('Paiement', v.paiement), '', v.livraison ? 'Votre commande sera livrée le ' + v.livraison + '.' : null, '', 'Merci pour votre confiance 🙏'),
  },
  paiement: {
    label: '💳 Confirmation de paiement',
    fields: [field('client', 'Nom du client', { req: true }), field('montant', 'Montant reçu (FCFA)', { req: true, type: 'number' }), field('moyen', 'Moyen de paiement'), field('produit', 'Produit ou référence')],
    build: (v) => compose(hi(v), '', 'Nous confirmons la bonne réception de votre paiement ✅', '', ln('Montant reçu', money(v.montant)), ln('Moyen de paiement', v.moyen), ln('Pour', v.produit), '', 'Merci pour votre confiance 🙏'),
  },
  expedition: {
    label: '📦 Expédition',
    fields: [field('client', 'Nom du client', { req: true }), field('produit', 'Produit', { req: true }), field('transport', 'Transporteur / moyen d\'envoi'), field('suivi', 'Numéro de suivi'), field('arrivee', 'Arrivée prévue')],
    build: (v) => compose(hi(v), '', 'Bonne nouvelle : votre commande a été expédiée 📦', '', ln('Produit', v.produit), ln('Transport', v.transport), ln('Numéro de suivi', v.suivi), ln('Arrivée prévue', v.arrivee), '', 'Nous vous contacterons à son arrivée.'),
  },
  livraison: {
    label: '🚚 Livraison',
    fields: [field('client', 'Nom du client', { req: true }), field('produit', 'Produit', { req: true }), field('quand', 'Date et heure de livraison', { req: true }), field('lieu', 'Lieu de livraison'), field('reste', 'Montant à payer à la livraison (FCFA)', { type: 'number' })],
    build: (v) => compose(hi(v), '', 'Votre commande est en route 🚚', '', ln('Produit', v.produit), ln('Livraison', v.quand), ln('Lieu', v.lieu), ln('Montant à régler', money(v.reste)), '', 'Merci de rester joignable. À bientôt 🙏'),
  },
  relance: {
    label: '🔔 Relance client',
    fields: [field('client', 'Nom du client', { req: true }), field('sujet', 'Produit ou sujet', { req: true }), field('date', 'Date de votre dernier échange')],
    build: (v) => compose(hi(v), '', 'Je me permets de revenir vers vous au sujet de : ' + v.sujet + '.', v.date ? 'Nous avons échangé le ' + v.date + '.' : null, '', 'Êtes-vous toujours intéressé(e) ? Je peux répondre à vos questions ou vous aider à finaliser votre commande.', '', 'Bonne journée 🙏'),
  },
  promo: {
    label: '🎁 Promotion',
    fields: [field('client', 'Nom du client (facultatif)'), field('produit', 'Produit', { req: true }), field('promo', 'Prix promo (FCFA)', { req: true, type: 'number' }), field('ancien', 'Ancien prix (FCFA)', { type: 'number' }), field('fin', 'Offre valable jusqu\'au')],
    build: (v) => compose(hi(v), '', '🎁 Offre spéciale pour vous !', '', ln('Produit', v.produit), ln('Ancien prix', money(v.ancien)), ln('Prix promo', money(v.promo)), ln('Valable jusqu\'au', v.fin), '', 'Intéressé(e) ? Répondez à ce message pour commander.'),
  },
  avis: {
    label: '⭐ Demande d\'avis',
    fields: [field('client', 'Nom du client', { req: true }), field('produit', 'Produit', { req: true }), field('lien', 'Lien pour laisser un avis (facultatif)')],
    build: (v) => compose(hi(v), '', 'Merci pour votre achat ! J\'espère que ' + v.produit + ' vous donne entière satisfaction.', '', 'Votre avis compte beaucoup pour nous : pourriez-vous nous dire en quelques mots ce que vous en pensez ? ⭐', v.lien ? 'Laissez votre avis ici : ' + v.lien : null, '', 'Merci 🙏'),
  },
};

let currentCategory = null;

function setStatus(text, type) {
  const el = $('#waStatus');
  el.textContent = text;
  el.className = 'status ' + (type || '');
}

function buildCategoryButtons() {
  const grid = $('#catGrid');
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn';
    btn.textContent = cat.label;
    btn.dataset.key = key;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => selectCategory(key));
    grid.append(btn);
  });
}

function selectCategory(key) {
  currentCategory = key;
  const cat = CATEGORIES[key];
  $$('.cat-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
  $('#waCatTitle').textContent = cat.label;

  const box = $('#waFields');
  box.replaceChildren(...cat.fields.map((f) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = 'wa-' + f.id;
    label.textContent = f.label + (f.req ? ' *' : '');
    const input = document.createElement('input');
    input.id = 'wa-' + f.id;
    input.type = f.type === 'number' ? 'number' : 'text';
    if (f.type === 'number') { input.inputMode = 'decimal'; input.min = '0'; input.step = 'any'; }
    if (f.placeholder) input.placeholder = f.placeholder;
    input.autocomplete = 'off';
    wrap.append(label, input);
    return wrap;
  }));

  $('#waMessage').value = '';
  setStatus('');
  $('#waStep2').hidden = false;
  $('#waStep2').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function generateMessage() {
  const cat = CATEGORIES[currentCategory];
  const values = {};
  const missing = [];
  cat.fields.forEach((f) => {
    values[f.id] = $('#wa-' + f.id).value.trim();
    if (f.req && !values[f.id]) missing.push(f.label);
  });
  if (missing.length) { setStatus('Veuillez renseigner : ' + missing.join(', ') + '.', 'bad'); return; }
  $('#waMessage').value = cat.build(values);
  setStatus('Message généré. Vous pouvez le modifier avant de l\'envoyer.', 'ok');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) { // repli si le presse-papiers moderne est indisponible (ex. ouverture en file://)
    const area = $('#waMessage');
    area.focus();
    area.select();
    try { return document.execCommand('copy'); } catch (e) { return false; }
  }
}

async function copyMessage() {
  const text = $('#waMessage').value.trim();
  if (!text) { setStatus('Générez ou saisissez d\'abord un message.', 'bad'); return; }
  const ok = await copyText(text);
  setStatus(ok ? '✅ Message copié !' : 'Copie impossible : sélectionnez le texte et copiez-le manuellement.', ok ? 'ok' : 'bad');
}

function openWhatsApp() {
  const text = $('#waMessage').value.trim();
  if (!text) { setStatus('Générez ou saisissez d\'abord un message.', 'bad'); return; }
  const raw = $('#waPhone').value.trim();
  const phone = raw.replace(/\D/g, '').replace(/^00/, '');
  if (raw && phone.length < 8) { setStatus('Numéro invalide : saisissez-le avec l\'indicatif du pays (ex. 22997000000).', 'bad'); return; }
  // Sans numéro, wa.me ouvre WhatsApp et laisse choisir le contact
  const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
  window.open(url, '_blank', 'noopener');
  setStatus('');
}

$('#waGenerate').addEventListener('click', generateMessage);
$('#waCopy').addEventListener('click', copyMessage);
$('#waOpen').addEventListener('click', openWhatsApp);

/* ---------- 6. Démarrage ---------- */
buildCategoryButtons();
$('#dDate').value = todayISO();
addLine();       // une première ligne de produit (appelle aussi renderInvoice)
updateCalc();
route(false);
