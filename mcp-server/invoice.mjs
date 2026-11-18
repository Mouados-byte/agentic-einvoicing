import { XMLParser } from 'fast-xml-parser';

// Checks a UBL 2.1 (Peppol BIS 3) or CII (Factur-X XML) invoice for what this demo covers:
// SIREN check digits, the buyer SIREN (new French mandatory mention), Peppol 0225 endpoints,
// French postcodes and two EN 16931 total rules. It is not a full EN 16931 / Peppol schematron validation.
const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false, processEntities: false });

export function isValidSiren(s) {
  if (!/^\d{9}$/.test(s ?? '')) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = Number(s[8 - i]) * (i % 2 ? 2 : 1);
    sum += d > 9 ? d - 9 : d;
  }
  return sum % 10 === 0;
}

const text = (node) => (node == null ? undefined : typeof node === 'object' ? node['#text'] : String(node))?.trim();
const amount = (node) => (text(node) === undefined ? undefined : Number(text(node)));
const asList = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const cents = (n) => Math.round(n * 100);
const endpoint = (node) => (node ? `${node['@_schemeID'] ?? '?'}:${text(node)}` : undefined);
const siren = (id) => id?.replace(/\s/g, '').slice(0, 9);
const ymd = (s) => (/^\d{8}$/.test(s ?? '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s);

// Both readers return the same shape; amounts in cents.
function fromUbl(doc) {
  const party = (p = {}) => ({
    name: text(p.PartyLegalEntity?.RegistrationName),
    siren: siren(text(p.PartyLegalEntity?.CompanyID)),
    endpoint: endpoint(p.EndpointID),
    country: text(p.PostalAddress?.Country?.IdentificationCode),
    postcode: text(p.PostalAddress?.PostalZone),
  });
  const totals = doc.LegalMonetaryTotal ?? {};
  return {
    invoice: { number: text(doc.ID), issueDate: text(doc.IssueDate), currency: text(doc.DocumentCurrencyCode) },
    seller: party(doc.AccountingSupplierParty?.Party),
    buyer: party(doc.AccountingCustomerParty?.Party),
    hasDeliveryAddress: Boolean(doc.Delivery?.DeliveryLocation?.Address),
    lineSum: asList(doc.InvoiceLine).reduce((s, l) => s + cents(amount(l.LineExtensionAmount) ?? 0), 0),
    bt106: amount(totals.LineExtensionAmount),
    bt109: amount(totals.TaxExclusiveAmount),
    bt110: asList(doc.TaxTotal).reduce((s, t) => s + cents(amount(t.TaxAmount) ?? 0), 0),
    bt112: amount(totals.TaxInclusiveAmount),
  };
}

function fromCii(doc) {
  const tx = doc.SupplyChainTradeTransaction ?? {};
  const agreement = tx.ApplicableHeaderTradeAgreement ?? {};
  const settlement = tx.ApplicableHeaderTradeSettlement ?? {};
  const sums = settlement.SpecifiedTradeSettlementHeaderMonetarySummation ?? {};
  const currency = text(settlement.InvoiceCurrencyCode);
  const party = (p = {}) => ({
    name: text(p.Name),
    siren: siren(text(p.SpecifiedLegalOrganization?.ID)),
    endpoint: endpoint(p.URIUniversalCommunication?.URIID),
    country: text(p.PostalTradeAddress?.CountryID),
    postcode: text(p.PostalTradeAddress?.PostcodeCode),
  });
  // BT-110 is the TaxTotalAmount in the invoice currency (a second one may be in the accounting currency).
  const taxTotals = asList(sums.TaxTotalAmount);
  const bt110 = taxTotals.find((t) => !t?.['@_currencyID'] || t['@_currencyID'] === currency) ?? taxTotals[0];
  return {
    invoice: { number: text(doc.ExchangedDocument?.ID), issueDate: ymd(text(doc.ExchangedDocument?.IssueDateTime?.DateTimeString)), currency },
    seller: party(agreement.SellerTradeParty),
    buyer: party(agreement.BuyerTradeParty),
    hasDeliveryAddress: Boolean(tx.ApplicableHeaderTradeDelivery?.ShipToTradeParty?.PostalTradeAddress),
    lineSum: asList(tx.IncludedSupplyChainTradeLineItem).reduce(
      (s, l) => s + cents(amount(l.SpecifiedLineTradeSettlement?.SpecifiedTradeSettlementLineMonetarySummation?.LineTotalAmount) ?? 0), 0),
    bt106: amount(sums.LineTotalAmount),
    bt109: amount(sums.TaxBasisTotalAmount),
    bt110: cents(amount(bt110) ?? 0),
    bt112: amount(sums.GrandTotalAmount),
  };
}

function checkParty(role, p, errors, warnings) {
  const ROLE = role.toUpperCase();
  if (!p.siren) {
    errors.push(role === 'buyer'
      ? { code: 'BUYER_SIREN_MISSING', message: 'Buyer SIREN (BT-47) is missing or empty: it is one of the new mandatory mentions for B2B. If the buyer is a private individual (B2C), the sale goes to e-reporting instead of e-invoicing (FR-ERP-01)', rule: 'FR-MEN-01' }
      : { code: 'SELLER_SIREN_MISSING', message: 'Seller legal registration id (BT-30) is missing or empty', rule: 'FR-MEN-01' });
  } else if (!isValidSiren(p.siren)) {
    errors.push({ code: `${ROLE}_SIREN_INVALID`, message: `${role} SIREN ${p.siren} fails the check digit`, rule: role === 'buyer' ? 'FR-MEN-01' : 'FR-PEP-02' });
  }
  // A French Peppol address is 0225:<SIREN>[_suffix]; the SIREN part must be the party's own.
  if (p.siren && p.endpoint?.startsWith('0225:') && p.endpoint.slice(5, 14) !== p.siren) {
    errors.push({ code: `${ROLE}_ENDPOINT_MISMATCH`, message: `${role} electronic address ${p.endpoint} does not start with its SIREN ${p.siren}`, rule: 'FR-PEP-02' });
  }
  if (p.country === 'FR' && p.postcode !== undefined && !/^\d{5}$/.test(p.postcode)) {
    warnings.push({ code: `${ROLE}_POSTCODE_INVALID`, message: `${role} postcode "${p.postcode}" is not a 5-digit French postcode` });
  }
}

export function checkInvoice(xml) {
  let root;
  try { root = parser.parse(xml); } catch { root = undefined; }
  const format = root?.Invoice && typeof root.Invoice === 'object' ? 'UBL'
    : root?.CrossIndustryInvoice && typeof root.CrossIndustryInvoice === 'object' ? 'CII' : undefined;
  if (!format) {
    return { valid: false, errors: [{ code: 'UNSUPPORTED_FORMAT', message: 'Not a UBL 2.1 <Invoice> or CII <CrossIndustryInvoice> document (for Factur-X, pass the embedded XML)', rule: 'FR-FMT-01' }], warnings: [] };
  }
  const m = format === 'UBL' ? fromUbl(root.Invoice) : fromCii(root.CrossIndustryInvoice);
  const errors = [];
  const warnings = [];

  for (const [field, bt] of [['number', 'BT-1'], ['issueDate', 'BT-2'], ['currency', 'BT-5']]) {
    if (!m.invoice[field]) errors.push({ code: `${bt}_MISSING`, message: `Missing ${field} (${bt})`, rule: 'EN 16931' });
  }
  checkParty('seller', m.seller, errors, warnings);
  checkParty('buyer', m.buyer, errors, warnings);
  if (!m.hasDeliveryAddress) {
    warnings.push({ code: 'DELIVERY_ADDRESS_ABSENT', message: 'No delivery address (BG-15): required only if it differs from the buyer address', rule: 'FR-MEN-01' });
  }
  if (m.bt106 !== undefined && cents(m.bt106) !== m.lineSum) {
    errors.push({ code: 'BR-CO-10', message: `Sum of line amounts (${m.lineSum / 100}) differs from total line amount BT-106 (${m.bt106})`, rule: 'EN 16931' });
  }
  if (m.bt109 !== undefined && m.bt112 !== undefined && cents(m.bt109) + m.bt110 !== cents(m.bt112)) {
    errors.push({ code: 'BR-CO-15', message: `Total without VAT (${m.bt109}) + VAT (${m.bt110 / 100}) differs from total with VAT BT-112 (${m.bt112})`, rule: 'EN 16931' });
  }

  return {
    valid: errors.length === 0,
    format, invoice: m.invoice, seller: m.seller, buyer: m.buyer, errors, warnings,
    notChecked: ['nature of operations', 'VAT on debits option', 'full EN 16931 / Peppol schematron'],
  };
}
