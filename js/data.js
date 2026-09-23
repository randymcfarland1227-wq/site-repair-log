// Offline seed — only used when APPS_SCRIPT_URL is blank (or the Sheet can't be reached on first load).
// Mirrors the seed in Code.gs, transcribed from the original 3x3 grid in the Sheet.
const META = {
  types: ['Bug', 'Design', 'Feature', 'Flow', 'Idea'],
  priorities: ['High', 'Medium', 'Low'],
  statuses: ['Idea', 'To Do', 'In Progress', 'Done', "Won't Do"],
};

const SEED_SITES = [
  'Occp Search Hub', 'Sales Hub', 'Session Notes (Ableton)',
  'Adventure Log', 'Move OS', 'Nutrition Site',
  'Goal Hub', 'Routines/TickTick', 'Workroom Overview',
].map((name, i) => ({ name, url: '', notes: '', order: i + 1 })).concat([
  // Mirrors ADDED_SITES in Code.gs.
  ['Fulfillment & Meaning', '', 'Personal reflection OS: reflect, understand, align, design. Repo: fulfillment-hub'],
  ['Income & Venture Lab', 'https://randymcfarland1227-wq.github.io/income-venture-lab/', 'Income ideas, ventures, investment research, experiments. Repo: income-venture-lab'],
  ['My Music Hub', '', 'Monthly music reviews, vocal warm-ups, music advancement sessions. Repo: my-music-hub'],
  ['Vocal Glow', '', 'Guided daily vocal warm-up routine. Repo: vocal-glow'],
  ['The Inner Archive', '', 'Artist identity / creative reference (The Feeling, Transmuted). Repo: the-inner-archive'],
  ['Peculiar Candle Storefront', '', 'Customer-facing Peculiar Candle Co. shop. Not on GitHub.'],
  ['Peculiar Command Center', 'https://randymcfarland1227-wq.github.io/peculiar-command-center/', 'Internal pre-launch studio for Peculiar Candle Co. Repo: peculiar-command-center'],
  ['Peculiar Storefront Backend', '', 'Private owner floor: orders, shipping, returns, stock, ledger. Repo: peculiar-storefront-backend'],
  ['Peculiar Candles Workshop', '', 'Jars, oils, wicks inventory, candle log, ratio calculator. Repo: peculiar-candles'],
].map(([name, url, notes], i) => ({ name, url, notes, order: 10 + i })));

const SEED_ITEMS = [
  ['Sales Hub', "I don't like the colors of the site or the font", 'Design'],
  ['Sales Hub', 'The photos for the new items are not showing on the site', 'Bug'],
  ['Sales Hub', "In the Actions page it doesn't let me edit whether they are complete, or delete ones I don't want — deletes also need to update in the sheet", 'Feature'],
  ['Sales Hub', 'Under Inventory, add a way to sort by most views', 'Feature'],
  ['Routines/TickTick', "I don't like that recovery options pops up as a daily task", 'Flow'],
  ['Routines/TickTick', 'Need sub-tasks, like check eBay, Depop, and Poshmark listings and notifications', 'Feature'],
  ['Routines/TickTick', 'Move Cardio and Abs back to a habit as a pre-gym routine', 'Flow'],
  ['Routines/TickTick', 'Undated items in Life Planning need sorting', 'Flow'],
  ['Routines/TickTick', 'Delete Non-Scheduled Planner task', 'Flow'],
  ['Workroom Overview', 'Need to be able to star tasks, not just roles', 'Feature'],
].map(([site, title, type], i) => ({
  id: 'S' + String(i + 1).padStart(3, '0'), site, title, details: '', type,
  priority: 'Medium', status: 'To Do', created: '2026-09-23', updated: '2026-09-23',
}));
