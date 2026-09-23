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
].map((name, i) => ({ name, url: '', notes: '', order: i + 1 }));

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
