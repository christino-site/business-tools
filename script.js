"use strict";

/* ===== CONFIGURATION : liens du pied de page (accueil) =====
   Colle ton lien entre les guillemets. Un bouton reste caché tant que son lien est vide. */
const TIP_URL = '';      // bouton « Donner un pourboire », ex. 'https://paypal.me/tonnom'
const SUPPORT_URL = 'https://wa.me/22951393126';  // bouton « Assistance », ex. 'https://wa.me/22951393126?text=Bonjour.%20Besoin%20d'assistance' ou 'mailto:contact@exemple.com'

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
const VIEWS = ['home', 'calc', 'invoice', 'whatsapp', 'converter', 'walink'];

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
  $('.paper').className = 'paper design-' + $('input[name="docDesign"]:checked').value;
  renderPaymentTerms(subtotal - discount + shipping);
  renderInvoiceExtras();
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
  if ($('#payErr').textContent) missing.push('des parties de paiement dont la somme égale le total');
  const box = $('#invErr');
  box.textContent = missing.length ? 'Veuillez renseigner : ' + missing.join(', ') + '.' : '';
  box.hidden = missing.length === 0;
  if (!missing.length) window.print();
});

/* ---------- 4b. Modalités de paiement (1, 2 ou 3 parties) ---------- */
let payManual = false; // devient true dès que l'utilisateur modifie lui-même un montant
const PAY_LABELS = ['Première partie', 'Deuxième partie', 'Troisième partie'];
const PAY_SHORT = ['1ère partie', '2e partie', '3e partie'];

function buildPaymentRows() {
  $('#payParts').innerHTML = PAY_LABELS.map((label) => `
    <div class="pay-part" hidden>
      <strong class="pay-title">${label}</strong>
      <div class="field"><label>Montant (FCFA)<input class="pay-amount" type="number" inputmode="decimal" min="0" step="any"></label></div>
      <div class="field"><label>Date (paiement ou échéance)<input class="pay-date" type="date"></label></div>
      <label class="pay-check"><input class="pay-paid" type="checkbox"> Déjà payé</label>
    </div>`).join('');
}

function readPayments() {
  const count = Number($('#payMode').value);
  return $$('.pay-part').slice(0, count).map((row, i) => ({
    label: PAY_SHORT[i],
    amount: Math.max(0, toNum($('.pay-amount', row).value) || 0),
    date: $('.pay-date', row).value,
    paid: $('.pay-paid', row).checked,
  }));
}

/** Met à jour le formulaire et l'aperçu des paiements. `total` = total général du document. */
function renderPaymentTerms(total) {
  const count = Number($('#payMode').value);
  const rows = $$('.pay-part');
  rows.forEach((row, i) => { row.hidden = i >= count; });

  if (count && !payManual) { // répartition égale automatique, modifiable ensuite
    const base = Math.floor(total / count);
    rows.slice(0, count).forEach((row, i) => {
      $('.pay-amount', row).value = i === count - 1 ? Number((total - base * (count - 1)).toFixed(2)) : base;
    });
  }

  $('#pPay').hidden = count === 0;
  $('#payErr').textContent = '';
  if (!count) return;

  const parts = readPayments();
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  const paid = parts.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  $('#pPayMode').textContent = count === 1 ? 'Paiement en 1 partie' : 'Paiement en ' + count + ' parties';
  $('#pPayList').replaceChildren(...parts.map((p) => {
    const d = frDate(p.date);
    const status = p.paid ? 'payée' + (d ? ' le ' + d : '') : 'à payer' + (d ? ' avant le ' + d : '');
    const li = document.createElement('li');
    li.textContent = p.label + ' : ' + fcfa(p.amount) + ' — ' + status;
    return li;
  }));
  $('#pPayRest').textContent = 'Déjà payé : ' + fcfa(paid) + ' — Reste à payer : ' + fcfa(Math.max(0, total - paid));
  if (Math.abs(sum - total) > 0.01) {
    $('#payErr').textContent = 'La somme des parties (' + fcfa(sum) + ') ne correspond pas au total (' + fcfa(total) + ').';
  }
}

buildPaymentRows();
$('#payMode').addEventListener('input', () => { payManual = false; });
$('#payParts').addEventListener('input', (e) => { if (e.target.classList.contains('pay-amount')) payManual = true; });

/* ---------- 4c. Moyens de paiement (QR), couleur du document, message de fin ---------- */
const DEFAULT_DOC_COLOR = '#0e6b4f';
const DOC_COLORS = [['Vert', '#0e6b4f'], ['Bleu', '#1d4ed8'], ['Bordeaux', '#9f1239'], ['Orange foncé', '#c2410c'], ['Violet', '#6d28d9'], ['Gris foncé', '#1f2937']];
const MAX_PAY_METHODS = 6;

/** Mélange une couleur #rrggbb avec le noir (0) ou le blanc (255). */
function mixColor(hex, target, amount) {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount));
  return '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Luminance relative (0 = noir, 1 = blanc) pour garantir un texte blanc lisible. */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Applique la couleur choisie au document seulement (pas au reste du site). */
function applyDocColor() {
  const paper = $('.paper');
  const chosen = $('#docColor').value;
  if (chosen === DEFAULT_DOC_COLOR) { // couleurs d'origine de la feuille de style
    ['--brand', '--brand-d', '--brand-l'].forEach((name) => paper.style.removeProperty(name));
    return;
  }
  let color = chosen;
  while (luminance(color) > 0.18) color = mixColor(color, 0, 0.1); // assez foncée pour du texte blanc
  paper.style.setProperty('--brand', color);
  paper.style.setProperty('--brand-d', mixColor(color, 0, 0.35));
  paper.style.setProperty('--brand-l', mixColor(color, 255, 0.88));
}

function applyThanksMessage() {
  const el = $('.p-thanks');
  const text = $('#docThanks').value.trim();
  el.textContent = text;
  el.hidden = !text;
}

function addPaymentMethod() {
  const msg = $('#pmMsg');
  msg.textContent = '';
  if ($$('.pm-row').length >= MAX_PAY_METHODS) { msg.textContent = 'Maximum ' + MAX_PAY_METHODS + ' moyens de paiement.'; return; }
  const row = document.createElement('div');
  row.className = 'pm-row';
  row.innerHTML = `
    <div class="field pm-wide"><label>Moyen de paiement<input class="pm-name" type="text" placeholder="MTN MoMo, Moov Money, Wave, banque…" autocomplete="off"></label></div>
    <div class="field"><label>Numéro / compte<input class="pm-number" type="text" autocomplete="off"></label></div>
    <div class="field"><label>Nom du titulaire<input class="pm-holder" type="text" autocomplete="off"></label></div>
    <div class="field pm-wide">
      <label>QR code (facultatif)<input class="pm-qr" type="file" accept="image/*"></label>
      <small class="err pm-qr-err" role="alert"></small>
      <button type="button" class="btn btn-ghost btn-sm pm-qr-del" hidden>Supprimer le QR code</button>
    </div>
    <button type="button" class="btn btn-danger btn-sm pm-del pm-wide">Supprimer ce moyen de paiement</button>`;
  $('#pmRows').append(row);
  $('.pm-name', row).focus();
  renderInvoice();
}

function removePaymentMethod(row) {
  if (row.dataset.qr) URL.revokeObjectURL(row.dataset.qr);
  row.remove();
  $('#pmMsg').textContent = '';
  renderInvoice();
}

function setPaymentQr(row, file) {
  const msg = $('.pm-qr-err', row);
  msg.textContent = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { msg.textContent = 'Le fichier choisi n\'est pas une image.'; $('.pm-qr', row).value = ''; return; }
  if (file.size > 3 * 1024 * 1024) { msg.textContent = 'Image trop lourde (3 Mo maximum).'; $('.pm-qr', row).value = ''; return; }
  if (row.dataset.qr) URL.revokeObjectURL(row.dataset.qr);
  row.dataset.qr = URL.createObjectURL(file); // reste local : aucune donnée envoyée
  $('.pm-qr-del', row).hidden = false;
  renderInvoice();
}

function clearPaymentQr(row) {
  if (row.dataset.qr) URL.revokeObjectURL(row.dataset.qr);
  delete row.dataset.qr;
  $('.pm-qr', row).value = '';
  $('.pm-qr-err', row).textContent = '';
  $('.pm-qr-del', row).hidden = true;
  renderInvoice();
}

/** Affiche les moyens de paiement du vendeur dans l'aperçu (texte brut uniquement). */
function renderPaymentMethods() {
  const methods = $$('.pm-row').map((row) => ({
    name: $('.pm-name', row).value.trim(),
    number: $('.pm-number', row).value.trim(),
    holder: $('.pm-holder', row).value.trim(),
    qr: row.dataset.qr || '',
  })).filter((m) => m.name || m.number || m.holder || m.qr);

  $('#pMethods').hidden = methods.length === 0;
  $('#pMethodsList').replaceChildren(...methods.map((m) => {
    const item = document.createElement('div');
    item.className = 'pm-item';
    const info = document.createElement('div');
    info.className = 'pm-info';
    [[m.name, 'strong'], [m.number, 'span'], [m.holder && 'Titulaire : ' + m.holder, 'span']].forEach(([text, tag]) => {
      if (!text) return;
      const el = document.createElement(tag);
      el.textContent = text;
      info.append(el);
    });
    item.append(info);
    if (m.qr) {
      const img = document.createElement('img');
      img.src = m.qr;
      img.alt = 'QR code de paiement' + (m.name ? ' ' + m.name : '');
      item.append(img);
    }
    return item;
  }));
}

function renderInvoiceExtras() {
  applyDocColor();
  applyThanksMessage();
  renderPaymentMethods();
}

function initInvoiceExtras() {
  $('#docSwatches').replaceChildren(...DOC_COLORS.map(([name, color]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.style.background = color;
    btn.setAttribute('aria-label', 'Couleur ' + name);
    btn.addEventListener('click', () => { $('#docColor').value = color; renderInvoice(); });
    return btn;
  }));
  $('#addPayMethod').addEventListener('click', addPaymentMethod);
  $('#pmRows').addEventListener('click', (e) => {
    const row = e.target.closest('.pm-row');
    if (!row) return;
    if (e.target.closest('.pm-del')) removePaymentMethod(row);
    else if (e.target.closest('.pm-qr-del')) clearPaymentQr(row);
  });
  $('#pmRows').addEventListener('change', (e) => {
    if (e.target.classList.contains('pm-qr')) setPaymentQr(e.target.closest('.pm-row'), e.target.files[0]);
  });
}

/** Pied de page de l'accueil : un bouton n'apparaît que si son lien est renseigné en haut du fichier. */
function initFooterLinks() {
  [['#tipLink', TIP_URL], ['#supportLink', SUPPORT_URL]].forEach(([id, url]) => {
    const link = $(id);
    link.hidden = !url;
    if (url) link.href = url;
  });
  $('#siteFooter').hidden = !TIP_URL && !SUPPORT_URL;
}

initInvoiceExtras();
initFooterLinks();

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

/* ---------- 5b. Convertisseur de mesures ---------- */
// Chaque unité : [nom, symbole, facteur vers l'unité de base de la catégorie]
const CONV_LENGTH = { // base : mètre
  mm: ['Millimètre', 'mm', 0.001], cm: ['Centimètre', 'cm', 0.01], m: ['Mètre', 'm', 1], km: ['Kilomètre', 'km', 1000],
  in: ['Pouce', 'in', 0.0254], ft: ['Pied', 'ft', 0.3048], yd: ['Yard', 'yd', 0.9144], mi: ['Mile', 'mi', 1609.344],
};
const CONVERTER_CATEGORIES = {
  length: { label: '📐 Longueur', units: CONV_LENGTH, def: { value: '100', from: 'cm', to: 'm' } },
  mass: { // base : kilogramme
    label: '⚖️ Poids / masse',
    units: { mg: ['Milligramme', 'mg', 1e-6], g: ['Gramme', 'g', 0.001], kg: ['Kilogramme', 'kg', 1], t: ['Tonne', 't', 1000], oz: ['Once', 'oz', 0.028349523125], lb: ['Livre', 'lb', 0.45359237] },
    def: { value: '1000', from: 'g', to: 'kg' },
  },
  volume: { // base : litre
    label: '🧴 Volume',
    units: { ml: ['Millilitre', 'ml', 0.001], cl: ['Centilitre', 'cl', 0.01], l: ['Litre', 'L', 1], m3: ['Mètre cube', 'm³', 1000], gal: ['Gallon US', 'gal US', 3.785411784], cup: ['Tasse', 'cup', 0.2365882365] },
    def: { value: '1000', from: 'ml', to: 'l' },
  },
  area: { // base : mètre carré
    label: '📦 Surface',
    units: { cm2: ['Centimètre carré', 'cm²', 0.0001], m2: ['Mètre carré', 'm²', 1], km2: ['Kilomètre carré', 'km²', 1000000], ha: ['Hectare', 'ha', 10000], acre: ['Acre', 'acre', 4046.8564224] },
    def: { value: '1', from: 'm2', to: 'cm2' },
  },
  temperature: { // formules spécifiques (pas de simple facteur)
    label: '🌡️ Température',
    units: { c: ['Celsius', '°C'], f: ['Fahrenheit', '°F'], k: ['Kelvin', 'K'] },
    def: { value: '0', from: 'c', to: 'f' },
  },
  dimensions: { // largeur × hauteur, mêmes unités de longueur courantes
    label: '📏 Dimensions (largeur × hauteur)',
    pair: true,
    units: { mm: CONV_LENGTH.mm, cm: CONV_LENGTH.cm, m: CONV_LENGTH.m, in: CONV_LENGTH.in },
    def: { value: '30', value2: '40', from: 'cm', to: 'in' },
  },
};
const converterState = { category: 'length', equation: '', timer: null };

/** Affichage français sans bruit de flottants : 2.5400000000000001 → "2,54". */
function formatConverterNumber(n, decimals = 4) {
  if (!Number.isFinite(n)) return '—';
  const v = Number(n.toPrecision(12));
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a < 1e-6 || a >= 1e15) return Number(v.toPrecision(5)).toExponential().replace('e+', 'e').replace('.', ',').replace('e', ' × 10^');
  const r = a < 1 ? Number(a.toPrecision(decimals + 2)) : Number(a.toFixed(decimals));
  const [int, dec] = String(r).split('.');
  return (v < 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') + (dec ? ',' + dec : '');
}

/** Convertit une valeur numérique (le calcul reste en nombre, jamais en texte). */
function convertMeasurement(value, from, to, category) {
  if (category === 'temperature') {
    const celsius = from === 'c' ? value : from === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    return to === 'c' ? celsius : to === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
  }
  const units = CONVERTER_CATEGORIES[category].units;
  return value * units[from][2] / units[to][2];
}

function readConverterValue(inputId, label, category) {
  const raw = $(inputId).value.trim();
  if (raw === '') return { empty: true };
  const value = toNum(raw.replace(/\s/g, ''));
  if (!Number.isFinite(value)) return { error: label + ' : saisissez un nombre valide.' };
  if (value < 0 && category !== 'temperature') return { error: label + ' : saisissez une valeur positive.' };
  return { value };
}

function updateConverter() {
  const category = converterState.category;
  const def = CONVERTER_CATEGORIES[category];
  const from = $('#convFrom').value;
  const to = $('#convTo').value;
  const fields = def.pair ? [['#convValue', 'Largeur'], ['#convValue2', 'Hauteur']] : [['#convValue', 'Valeur']];
  const readings = fields.map(([id, label]) => readConverterValue(id, label, category));

  let error = (readings.find((r) => r.error) || {}).error || '';
  if (!error && category === 'temperature' && !readings[0].empty
      && convertMeasurement(readings[0].value, from, 'c', category) < -273.15 - 1e-9) {
    error = 'Température impossible : elle est inférieure au zéro absolu.';
  }
  $('#convErr').textContent = error;

  if (error || readings.some((r) => r.empty)) {
    converterState.equation = '';
    $('#convResult').textContent = '—';
    $('#convEquation').textContent = '';
    return;
  }

  const decimals = def.pair ? 2 : 4;
  const symbol = (key) => def.units[key][1];
  const inputs = readings.map((r) => formatConverterNumber(r.value));
  const outputs = readings.map((r) => formatConverterNumber(convertMeasurement(r.value, from, to, category), decimals));
  const result = outputs.join(' × ') + ' ' + symbol(to);
  converterState.equation = inputs.join(' × ') + ' ' + symbol(from) + ' = ' + result;
  $('#convResult').textContent = result;
  $('#convEquation').textContent = converterState.equation;
}

/** Remplit les listes d'unités et recharge les valeurs par défaut de la catégorie. */
function updateConverterUnits(category) {
  const def = CONVERTER_CATEGORIES[category];
  converterState.category = category;
  ['#convFrom', '#convTo'].forEach((id) => {
    $(id).replaceChildren(...Object.entries(def.units).map(([key, u]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = u[0] + ' (' + u[1] + ')';
      return option;
    }));
  });
  $('#convCategory').value = category;
  $('#convFrom').value = def.def.from;
  $('#convTo').value = def.def.to;
  $('#convValue').value = def.def.value;
  $('#convValue2').value = def.def.value2 || '';
  $('#convValue2Wrap').hidden = !def.pair;
  $('#convValueLabel').textContent = def.pair ? 'Largeur' : 'Valeur';
  updateConverter();
}

function swapConverterUnits() {
  const from = $('#convFrom');
  const to = $('#convTo');
  [from.value, to.value] = [to.value, from.value];
  updateConverter();
}

function showConverterStatus(text, type) {
  const el = $('#convStatus');
  el.textContent = text;
  el.className = 'status ' + type;
  clearTimeout(converterState.timer);
  converterState.timer = setTimeout(() => { el.textContent = ''; }, 2500);
}

/** Copie de secours quand navigator.clipboard est indisponible (ex. ouverture en file://). */
function copyConverterFallback(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
  area.remove();
  return ok;
}

async function copyConversionResult() {
  const text = converterState.equation.replace(/\u00A0/g, ' ');
  if (!text) { showConverterStatus('Saisissez une valeur valide avant de copier.', 'bad'); return; }
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (err) {
    ok = copyConverterFallback(text);
  }
  showConverterStatus(ok ? '✅ Copié !' : 'Copie impossible : sélectionnez le résultat et copiez-le manuellement.', ok ? 'ok' : 'bad');
}

function resetConverter() {
  updateConverterUnits(converterState.category);
  $('#convStatus').textContent = '';
}

function initUnitConverter() {
  const select = $('#convCategory');
  Object.entries(CONVERTER_CATEGORIES).forEach(([key, cat]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = cat.label;
    select.append(option);
  });
  select.addEventListener('change', () => updateConverterUnits(select.value));
  ['#convValue', '#convValue2'].forEach((id) => $(id).addEventListener('input', updateConverter));
  ['#convFrom', '#convTo'].forEach((id) => $(id).addEventListener('change', updateConverter));
  $('#convSwap').addEventListener('click', swapConverterUnits);
  $('#convCopy').addEventListener('click', copyConversionResult);
  $('#convReset').addEventListener('click', resetConverter);
  updateConverterUnits('length');
}

/* ---------- 5c. Lien WhatsApp direct (wa.me) ---------- */
let waLinkTimer = null;

/** Construit le lien à partir du numéro et du message. Retourne '' si le numéro est invalide. */
function updateWhatsAppLink(showEmptyError = false) {
  const raw = $('#wlPhone').value.trim();
  const digits = raw.replace(/\D/g, '').replace(/^00/, '');
  const valid = digits.length >= 8 && digits.length <= 15;

  let error = '';
  if (!raw) error = showEmptyError ? 'Veuillez saisir un numéro WhatsApp avec l\'indicatif du pays.' : '';
  else if (!valid) error = 'Numéro invalide : saisissez l\'indicatif du pays puis le numéro (8 à 15 chiffres).';
  $('#wlErr').textContent = error;
  $('#wlPhone').setAttribute('aria-invalid', error ? 'true' : 'false');

  const message = $('#wlMessage').value.trim();
  const link = valid ? 'https://wa.me/' + digits + (message ? '?text=' + encodeURIComponent(message) : '') : '';
  $('#wlLink').value = link;
  return link;
}

function showWaLinkStatus(text, type) {
  const el = $('#wlStatus');
  el.textContent = text;
  el.className = 'status ' + type;
  clearTimeout(waLinkTimer);
  waLinkTimer = setTimeout(() => { el.textContent = ''; }, 2500);
}

async function copyWhatsAppLink() {
  const link = updateWhatsAppLink(true);
  if (!link) { showWaLinkStatus('Saisissez d\'abord un numéro valide.', 'bad'); return; }
  let ok = false;
  try {
    await navigator.clipboard.writeText(link);
    ok = true;
  } catch (err) { // repli : on sélectionne le champ du lien et on copie
    const field = $('#wlLink');
    field.focus();
    field.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  }
  showWaLinkStatus(ok ? '✅ Lien copié !' : 'Copie impossible : sélectionnez le lien et copiez-le manuellement.', ok ? 'ok' : 'bad');
}

function openWhatsAppLink() {
  const link = updateWhatsAppLink(true);
  if (!link) { showWaLinkStatus('Saisissez d\'abord un numéro valide.', 'bad'); return; }
  window.open(link, '_blank', 'noopener');
}

function resetWhatsAppLink() {
  $('#wlPhone').value = '';
  $('#wlMessage').value = '';
  $('#wlStatus').textContent = '';
  updateWhatsAppLink();
}

function initWhatsAppLink() {
  ['#wlPhone', '#wlMessage'].forEach((id) => $(id).addEventListener('input', () => updateWhatsAppLink()));
  $('#wlCopy').addEventListener('click', copyWhatsAppLink);
  $('#wlTest').addEventListener('click', openWhatsAppLink);
  $('#wlReset').addEventListener('click', resetWhatsAppLink);
  updateWhatsAppLink();
}

/* ---------- 6. Démarrage ---------- */
buildCategoryButtons();
$('#dDate').value = todayISO();
addLine();       // une première ligne de produit (appelle aussi renderInvoice)
updateCalc();
initUnitConverter();
initWhatsAppLink();
route(false);
