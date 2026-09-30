'use strict';
// Static checks on the HTML screens. They catch the mistakes that are easy to make when
// six hand-written pages share one shell: a link to a page that does not exist, a nav
// that drifts between pages, a class Tailwind never compiled, a CDN creeping back in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..');
const root = path.join(repo, 'apps', 'html');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// The service serves pages from apps/html and /assets/ from the repository's assets/ folder.
const onDisk = target => target.startsWith('/assets/') ? path.join(repo, target) : path.join(root, target);
const staffPages = ['businessDashbord.html', 'metricsDashbord.html', 'MenuManagment.html', 'history.html'];
const customerPages = ['MenuUI.html', 'readypickupUI.html'];
const pages = [...staffPages, ...customerPages];

test('every local link, script and stylesheet points at a file that exists', () => {
  for (const page of pages) {
    // /analytics/ is the separately built React app (npm run setup && npm run build); its dist/ is not committed.
    const targets = [...read(page).matchAll(/\b(?:href|src)="([^"#?]+)[^"]*"/g)].map(match => match[1]).filter(target => !/^(https?:|mailto:|tel:|data:)/.test(target) && !target.startsWith('/analytics/') && !target.includes('${') && !target.includes("'"));
    for (const target of targets) assert.ok(fs.existsSync(onDisk(target)), `${page} links to missing ${target}`);
  }
});

test('nothing is loaded from a CDN except the two web fonts, so the counter works offline', () => {
  for (const page of pages) {
    const external = [...read(page).matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(https?:[^"]+)"/g)].map(match => match[1]);
    for (const url of external) assert.match(url, /^https:\/\/fonts\.googleapis\.com\//, `${page} loads ${url}`);
  }
});

test('staff screens share one shell and mark exactly their own nav item as current', () => {
  const region = (html, open, close) => { const start = html.indexOf(open); assert.notEqual(start, -1, `missing ${open}`); return html.slice(start, html.indexOf(close, start) + close.length); };
  const shells = staffPages.map(page => {
    const html = read(page);
    assert.match(html, /<body[^>]*\bdata-mf-shell\b/, `${page} must opt in to the shared shell`);
    const parts = [region(html, '<header id="mobile-header"', '</header>'), region(html, '<aside id="sidebar"', '</aside>'), region(html, '<nav id="mobile-nav"', '</nav>')];
    for (const part of parts.slice(1)) {
      const current = [...part.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(match => match[1]);
      assert.deepEqual(current, [page], `${page} nav should mark itself current`);
    }
    return parts.join('\n').replace(/ aria-current="page"/g, '').replace(/\s+/g, ' ');
  });
  for (let i = 1; i < shells.length; i++) assert.equal(shells[i], shells[0], `${staffPages[i]} shell differs from ${staffPages[0]}`);
});

test('every screen loads translation before the UI helpers and offers the language picker', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<html lang="es">/, `${page} should default to Spanish`);
    const order = ['masaflow-store.js', 'masaflow-i18n.js', 'masaflow-ui.js'].map(file => html.indexOf(`/assets/${file}`));
    assert.ok(order.every(index => index > 0) && order[0] < order[1] && order[1] < order[2], `${page} must load store, then i18n, then UI helpers`);
    assert.match(html, /data-mf-language-host/, `${page} needs a slot for the language picker`);
  }
});

test('customer screens do not carry the staff shell', () => {
  for (const page of customerPages) assert.doesNotMatch(read(page), /data-mf-shell|id="sidebar"|id="mobile-nav"/, page);
});

test('the compiled stylesheet contains every class the screens build at runtime', () => {
  // Tailwind only emits classes it finds written out in full. A class assembled from
  // pieces compiles to nothing, so sample the state-dependent ones that are easy to break.
  const css = fs.readFileSync(path.join(repo, 'assets', 'masaflow.css'), 'utf8');
  const escape = name => name.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  const stateClasses = ['order-card-pulse', 'price-pulse', 'animate-slide-up', 'bg-orange-50', 'bg-green-50', 'bg-red-50', 'text-orange-600', 'text-green-600', 'text-red-600', 'border-orange-500', 'bg-emerald-500', 'rounded-[32px]', 'rounded-[40px]', 'mf-toast-order', 'mf-sync', 'z-bar', 'z-overlay'];
  for (const name of stateClasses) assert.ok(css.includes(`.${escape(name)}`), `masaflow.css is missing .${name} — run npm run build:css`);
  for (const page of pages) assert.match(read(page), /<link rel="stylesheet" href="\/assets\/masaflow\.css">/, `${page} must load the compiled stylesheet`);
});

test('no mockup placeholders or simulation code shipped', () => {
  const leftovers = [/Maria Sanchez/, /Carlos Ruiz/, /Roberto J\./, /Lucia Flores/, /Terminal 0?1/, /Tablet 04/, /Head Chef/, /uxpilot-auth\.appspot\.com\/avatars/, /1,284/, /\$2,485/, /simulateNewOrder/, /cdn\.tailwindcss\.com/, /\bonclick=/, /\bz-\[\d+\]/];
  for (const page of pages) for (const pattern of leftovers) assert.doesNotMatch(read(page), pattern, `${page} still contains ${pattern}`);
});

test('the hooks the cash workflow depends on are still on each screen', () => {
  const required = {
    'businessDashbord.html': ['id="queue-error"', 'id="awaiting-orders"', 'id="kitchen-orders"', 'id="shift-warning"', 'id="draft-count"', 'id="pending-count"', 'id="preparing-count"', 'id="ready-count"', 'data-tender=', 'data-advance=', 'data-receipt=', 'data-filter='],
    'metricsDashbord.html': ['data-testid="cash-receipts"', 'data-testid="net-sales"', 'data-testid="transaction-count"', 'data-testid="average-ticket"', 'data-testid="revenue-chart"', 'data-testid="top-items"', 'data-testid="recent-paid-orders"', 'id="metrics-date"', 'data-period='],
    'MenuManagment.html': ['id="menu-search"', 'id="add-item"', 'id="menu-grid"', 'id="item-form"', 'id="item-name"', 'id="item-price"', 'id="save-item"', 'data-testid="menu-audit"', 'data-availability=', 'data-edit=', 'data-delete='],
    'history.html': ['id="ledger-error"', 'id="shift-controls"', 'id="open-shift-form"', 'id="cash-drop-form"', 'id="close-shift-form"', 'id="transactions-body"', 'id="audits-body"', 'id="drops-feed"', 'id="activity-feed"', 'id="manual-drawer"', 'id="transaction-search"', 'id="transaction-scope"'],
    'MenuUI.html': ['id="menu-items"', 'id="categories"', 'id="customizer-modal"', 'id="masa-options"', 'id="extra-options"', 'id="add-to-cart"', 'id="view-cart"', 'id="checkout-form"', 'id="customer-name"', 'id="customer-phone"', 'id="place-order"', 'readypickupUI.html?order='],
    'readypickupUI.html': ['id="ready-overlay"', 'MenuUI.html']
  };
  for (const [page, hooks] of Object.entries(required)) { const html = read(page); for (const hook of hooks) assert.ok(html.includes(hook), `${page} lost ${hook}`); }
});
