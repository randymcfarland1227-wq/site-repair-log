/**
 * Backend for the Site Repair Log site. Bound to the "Site Update and Repair Log
 * and Ideas" spreadsheet and deployed as a Web App (see SETUP.md).
 *
 * The first request reshapes the sheet: the old 3x3 grid tab is renamed
 * "Original Layout" (kept, untouched), and two real tables are created:
 *   Log   — one row per repair / idea / flow
 *   Sites — one row per site (name, URL, notes, order)
 * Edit either tab by hand at any time; the site reads it back on refresh.
 *
 * Endpoints (all on the same Web App URL):
 *   GET  ?action=all -> {sites:[...], items:[...], meta:{types, priorities, statuses}}
 *   POST {action:'addItem', item}          -> the new item
 *   POST {action:'updateItem', id, fields} -> the updated item
 *   POST {action:'deleteItem', id}
 *   POST {action:'addSite', site}          -> the new site
 *   POST {action:'updateSite', name, fields} (renaming cascades to Log rows)
 *   POST {action:'deleteSite', name, deleteItems}
 */

var LOG_SHEET = 'Log';
var SITES_SHEET = 'Sites';
var ORIGINAL_SHEET = 'Original Layout';

var LOG_HEADERS = ['ID', 'Site', 'Item', 'Details', 'Type', 'Priority', 'Status', 'Created', 'Updated'];
var SITE_HEADERS = ['Site', 'URL', 'Notes', 'Order'];

var TYPES = ['Bug', 'Design', 'Feature', 'Flow', 'Idea'];
var PRIORITIES = ['High', 'Medium', 'Low'];
var STATUSES = ['Idea', 'To Do', 'In Progress', 'Done', "Won't Do"];

// Seed data transcribed from the original 3x3 grid (Sheet1), used once.
var SEED_SITES = [
  'Occp Search Hub', 'Sales Hub', 'Session Notes (Ableton)',
  'Adventure Log', 'Move OS', 'Nutrition Site',
  'Goal Hub', 'Routines/TickTick', 'Workroom Overview'
];
// Sites added after the Sheet was first set up. addMissingSites() appends any
// that aren't on the Sites tab yet, once per batch (so deleting one later sticks).
var ADDED_SITES_KEY = 'addedSites_2026_09_23';
var ADDED_SITES = [
  ['Fulfillment & Meaning', '', 'Personal reflection OS: reflect, understand, align, design. Repo: fulfillment-hub'],
  ['Income & Venture Lab', 'https://randymcfarland1227-wq.github.io/income-venture-lab/', 'Income ideas, ventures, investment research, experiments. Repo: income-venture-lab'],
  ['My Music Hub', '', 'Monthly music reviews, vocal warm-ups, music advancement sessions. Repo: my-music-hub'],
  ['Vocal Glow', '', 'Guided daily vocal warm-up routine. Repo: vocal-glow'],
  ['The Inner Archive', '', 'Artist identity / creative reference (The Feeling, Transmuted). Repo: the-inner-archive'],
  ['Peculiar Candle Storefront', '', 'Customer-facing Peculiar Candle Co. shop. Not on GitHub.'],
  ['Peculiar Command Center', 'https://randymcfarland1227-wq.github.io/peculiar-command-center/', 'Internal pre-launch studio for Peculiar Candle Co. Repo: peculiar-command-center'],
  ['Peculiar Storefront Backend', '', 'Private owner floor: orders, shipping, returns, stock, ledger. Repo: peculiar-storefront-backend'],
  ['Peculiar Candles Workshop', '', 'Jars, oils, wicks inventory, candle log, ratio calculator. Repo: peculiar-candles']
];
var SEED_ITEMS = [
  ['Sales Hub', "I don't like the colors of the site or the font", 'Design'],
  ['Sales Hub', 'The photos for the new items are not showing on the site', 'Bug'],
  ['Sales Hub', "In the Actions page it doesn't let me edit whether they are complete, or delete ones I don't want — deletes also need to update in the sheet", 'Feature'],
  ['Sales Hub', 'Under Inventory, add a way to sort by most views', 'Feature'],
  ['Routines/TickTick', "I don't like that recovery options pops up as a daily task", 'Flow'],
  ['Routines/TickTick', 'Need sub-tasks, like check eBay, Depop, and Poshmark listings and notifications', 'Feature'],
  ['Routines/TickTick', 'Move Cardio and Abs back to a habit as a pre-gym routine', 'Flow'],
  ['Routines/TickTick', 'Undated items in Life Planning need sorting', 'Flow'],
  ['Routines/TickTick', 'Delete Non-Scheduled Planner task', 'Flow'],
  ['Workroom Overview', 'Need to be able to star tasks, not just roles', 'Feature']
];

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'all';
  try {
    ensureSetup();
    if (action === 'all') return jsonOut(getAll());
    return jsonOut({ error: 'unknown action' });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureSetup();
    var body = JSON.parse(e.postData.contents);
    var a = body.action;
    if (a === 'addItem') return jsonOut(addItem(body.item || {}));
    if (a === 'updateItem') return jsonOut(updateItem(body.id, body.fields || {}));
    if (a === 'deleteItem') return jsonOut(deleteItem(body.id));
    if (a === 'addSite') return jsonOut(addSite(body.site || {}));
    if (a === 'updateSite') return jsonOut(updateSite(body.name, body.fields || {}));
    if (a === 'deleteSite') return jsonOut(deleteSite(body.name, !!body.deleteItems));
    return jsonOut({ error: 'unknown action' });
  } catch (err) {
    return jsonOut({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Stamp "Updated" when a Log row is edited by hand in the Sheet.
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== LOG_SHEET || e.range.getRow() < 2) return;
  var updCol = LOG_HEADERS.indexOf('Updated') + 1;
  if (e.range.getColumn() === updCol) return;
  for (var r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    sheet.getRange(r, updCol).setValue(today());
    var idCell = sheet.getRange(r, 1);
    if (!idCell.getValue() && sheet.getRange(r, 3).getValue()) idCell.setValue(newId());
  }
}

// ---------------------------------------------------------------------
// One-time sheet redesign
// ---------------------------------------------------------------------

function ensureSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(LOG_SHEET) && ss.getSheetByName(SITES_SHEET)) { addMissingSites(); return; }

  var original = ss.getSheetByName('Sheet1');
  if (original && !ss.getSheetByName(ORIGINAL_SHEET)) original.setName(ORIGINAL_SHEET);

  var sites = ss.getSheetByName(SITES_SHEET) || ss.insertSheet(SITES_SHEET, 0);
  if (sites.getLastRow() === 0) {
    sites.appendRow(SITE_HEADERS);
    var siteRows = SEED_SITES.map(function (s, i) { return [s, '', '', i + 1]; });
    sites.getRange(2, 1, siteRows.length, SITE_HEADERS.length).setValues(siteRows);
    styleHeader(sites, SITE_HEADERS.length);
    sites.setColumnWidth(1, 220); sites.setColumnWidth(2, 360); sites.setColumnWidth(3, 360); sites.setColumnWidth(4, 70);
  }

  var log = ss.getSheetByName(LOG_SHEET) || ss.insertSheet(LOG_SHEET, 0);
  if (log.getLastRow() === 0) {
    log.appendRow(LOG_HEADERS);
    var d = today();
    var rows = SEED_ITEMS.map(function (it) { return [newId(), it[0], it[1], '', it[2], 'Medium', 'To Do', d, d]; });
    log.getRange(2, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    styleHeader(log, LOG_HEADERS.length);
    formatLog(log);
  }
  ss.setActiveSheet(log);
  addMissingSites();
}

function addMissingSites() {
  // Marker lives in sheet metadata (not PropertiesService) so the script keeps
  // its original spreadsheets.currentonly scope and needs no re-authorization.
  var sheet = sheetByName(SITES_SHEET);
  if (sheet.createDeveloperMetadataFinder().withKey(ADDED_SITES_KEY).find().length) return;
  ADDED_SITES.forEach(function (s) {
    if (!findRow(sheet, 1, s[0])) sheet.appendRow([s[0], s[1], s[2], sheet.getLastRow()]);
  });
  sheet.addDeveloperMetadata(ADDED_SITES_KEY, '1');
}

function styleHeader(sheet, n) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, n)
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#23211d')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 30);
}

function formatLog(log) {
  var widths = [90, 170, 380, 300, 90, 90, 110, 100, 100];
  widths.forEach(function (w, i) { log.setColumnWidth(i + 1, w); });
  var max = log.getMaxRows();
  log.getRange(2, 3, max - 1, 2).setWrap(true);
  log.getRange(2, 1, max - 1, LOG_HEADERS.length).setVerticalAlignment('top');
  log.getRange(2, 8, max - 1, 2).setNumberFormat('@');

  var ss = log.getParent();
  var sitesRange = ss.getSheetByName(SITES_SHEET).getRange('A2:A');
  setListRule(log.getRange(2, 2, max - 1), SpreadsheetApp.newDataValidation().requireValueInRange(sitesRange, true));
  setListRule(log.getRange(2, 5, max - 1), SpreadsheetApp.newDataValidation().requireValueInList(TYPES, true));
  setListRule(log.getRange(2, 6, max - 1), SpreadsheetApp.newDataValidation().requireValueInList(PRIORITIES, true));
  setListRule(log.getRange(2, 7, max - 1), SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true));

  var statusRange = log.getRange(2, 7, max - 1);
  var prioRange = log.getRange(2, 6, max - 1);
  var rowRange = log.getRange(2, 1, max - 1, LOG_HEADERS.length);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($G2="Done",$G2="Won\'t Do")')
      .setFontColor('#a39d8f').setRanges([rowRange]).build(),
    cellRule(statusRange, 'Idea', '#efe9fb', '#5b3fa0'),
    cellRule(statusRange, 'To Do', '#e8edfb', '#34459e'),
    cellRule(statusRange, 'In Progress', '#fdf1dc', '#8a5a0c'),
    cellRule(statusRange, 'Done', '#e2f3ea', '#1f6b48'),
    cellRule(prioRange, 'High', '#fbe4dc', '#a33a15')
  ];
  log.setConditionalFormatRules(rules);
  log.getRange(1, 1, max, LOG_HEADERS.length).createFilter();
}

function setListRule(range, builder) { range.setDataValidation(builder.setAllowInvalid(true).build()); }
function cellRule(range, text, bg, fg) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text)
    .setBackground(bg).setFontColor(fg).setRanges([range]).build();
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

function getAll() {
  return {
    sites: getSites(),
    items: getItems(),
    meta: { types: TYPES, priorities: PRIORITIES, statuses: STATUSES },
    fetchedAt: new Date().toISOString()
  };
}

function getSites() {
  var sheet = sheetByName(SITES_SHEET);
  var data = sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var name = String(data[r][0]).trim();
    if (!name) continue;
    out.push({ name: name, url: String(data[r][1] || '').trim(), notes: String(data[r][2] || ''), order: Number(data[r][3]) || r });
  }
  out.sort(function (a, b) { return a.order - b.order; });
  return out;
}

function getItems() {
  var sheet = sheetByName(LOG_SHEET);
  var data = sheet.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!String(row[2]).trim() && !String(row[1]).trim()) continue;
    var id = String(row[0] || '').trim();
    if (!id) { id = newId(); sheet.getRange(r + 1, 1).setValue(id); }
    out.push(rowToItem(row, id));
  }
  return out;
}

function rowToItem(row, id) {
  return {
    id: id || String(row[0]),
    site: String(row[1] || '').trim(),
    title: String(row[2] || ''),
    details: String(row[3] || ''),
    type: String(row[4] || ''),
    priority: String(row[5] || ''),
    status: String(row[6] || '') || 'To Do',
    created: fmtDate(row[7]),
    updated: fmtDate(row[8])
  };
}

// ---------------------------------------------------------------------
// Item writes
// ---------------------------------------------------------------------

var ITEM_FIELDS = { site: 2, title: 3, details: 4, type: 5, priority: 6, status: 7 };

function addItem(item) {
  var sheet = sheetByName(LOG_SHEET);
  var d = today();
  var id = item.id || newId();
  var row = [id, item.site || '', item.title || '', item.details || '', item.type || 'Idea',
    item.priority || 'Medium', item.status || 'To Do', d, d];
  sheet.appendRow(row);
  return rowToItem(row, id);
}

function updateItem(id, fields) {
  var sheet = sheetByName(LOG_SHEET);
  var r = findRow(sheet, 1, id);
  if (!r) return { ok: false, error: 'not found' };
  Object.keys(fields).forEach(function (k) {
    if (ITEM_FIELDS[k]) sheet.getRange(r, ITEM_FIELDS[k]).setValue(fields[k]);
  });
  sheet.getRange(r, 9).setValue(today());
  var row = sheet.getRange(r, 1, 1, LOG_HEADERS.length).getValues()[0];
  return rowToItem(row, String(row[0]));
}

function deleteItem(id) {
  var sheet = sheetByName(LOG_SHEET);
  var r = findRow(sheet, 1, id);
  if (!r) return { ok: false, error: 'not found' };
  sheet.deleteRow(r);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Site writes
// ---------------------------------------------------------------------

function addSite(site) {
  var sheet = sheetByName(SITES_SHEET);
  var name = String(site.name || '').trim();
  if (!name) return { ok: false, error: 'name required' };
  if (findRow(sheet, 1, name)) return { ok: false, error: 'site exists' };
  var order = sheet.getLastRow(); // header row makes this next index
  sheet.appendRow([name, site.url || '', site.notes || '', order]);
  return { name: name, url: site.url || '', notes: site.notes || '', order: order };
}

function updateSite(name, fields) {
  var sheet = sheetByName(SITES_SHEET);
  var r = findRow(sheet, 1, name);
  if (!r) return { ok: false, error: 'not found' };
  if (fields.url !== undefined) sheet.getRange(r, 2).setValue(fields.url);
  if (fields.notes !== undefined) sheet.getRange(r, 3).setValue(fields.notes);
  if (fields.order !== undefined) sheet.getRange(r, 4).setValue(fields.order);
  var newName = fields.name !== undefined ? String(fields.name).trim() : name;
  if (newName && newName !== name) {
    sheet.getRange(r, 1).setValue(newName);
    var log = sheetByName(LOG_SHEET);
    var data = log.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === name) log.getRange(i + 1, 2).setValue(newName);
    }
  }
  return { ok: true };
}

function deleteSite(name, deleteItems) {
  var sheet = sheetByName(SITES_SHEET);
  var r = findRow(sheet, 1, name);
  if (!r) return { ok: false, error: 'not found' };
  sheet.deleteRow(r);
  if (deleteItems) {
    var log = sheetByName(LOG_SHEET);
    var data = log.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]).trim() === name) log.deleteRow(i + 1);
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function sheetByName(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

function findRow(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var vals = sheet.getRange(2, col, last - 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === String(value).trim()) return i + 2;
  }
  return 0;
}

function newId() { return 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 7).toUpperCase(); }
function today() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function fmtDate(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}
