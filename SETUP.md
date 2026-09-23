# Site Repair Log

A live, two-way view of the "Site Update and Repair Log and Ideas" Google Sheet.

- **Site:** https://randymcfarland1227-wq.github.io/site-repair-log/
- **Sheet:** https://docs.google.com/spreadsheets/d/1rk3rFvL86Bep5aon8ujrnnip6oxmWCWXfK7ODhXUuU0/edit
- **Apps Script (bound to the Sheet):** https://script.google.com/d/1sXPW3G6mR8SeifdgK5_KvQwLufYpAWdyjV_Vi89wwMfTV-TM5MRrlark/edit

## How the Sheet is laid out

On the first request, `Code.gs` reshapes the Sheet (once):

| Tab | What it holds |
| --- | --- |
| **Log** | One row per item: ID, Site, Item, Details, Type, Priority, Status, Created, Updated. Dropdowns, status colors, and a filter are already set up. |
| **Sites** | One row per site: Site, URL, Notes, Order. Paste site links into the URL column. |
| **Original Layout** | The old 3×3 grid, renamed and left untouched. Delete it whenever you like. |

Edit either tab directly in the Sheet. The site picks the changes up when you refresh, switch back to the tab, or within about a minute. Anything you add, edit, or delete on the site is written straight back to the Sheet. Editing a Log row by hand stamps its Updated date. A new row typed in with no ID gets one automatically.

## One-time authorization

The script runs as you, so Google needs you to approve it once. Open the Apps Script link above, choose `ensureSetup` in the function dropdown, click **Run**, then **Review permissions → Allow**. (It only asks for access to this one spreadsheet.)

## Redeploying Code.gs

The Documents folder is iCloud-offloaded, so run clasp from a copy outside it:

```bash
cp Code.gs <scratch>/repairlog-script/Code.js
cd <scratch>/repairlog-script && clasp push --force
clasp deploy --deploymentId AKfycbwj-pFZN8sUA4e_7kfVnQ4QW5M9h6JoNMeLxKtPMQjjIL7bfnHr-NQylW0ShbA0NJAu --description "..."
```

`.clasp.json` there holds scriptId `1sXPW3G6mR8SeifdgK5_KvQwLufYpAWdyjV_Vi89wwMfTV-TM5MRrlark`. `appsscript.json` needs the `webapp` block (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`).

## Offline mode

If `APPS_SCRIPT_URL` in `js/config.js` is blank or the Sheet can't be reached, the site still works from `js/data.js` plus this browser's localStorage (`site-repair-log-v1`).
