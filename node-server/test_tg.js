const Database = require('better-sqlite3');
const db = new Database('/opt/fisher-node/data/fisher.db');
const row = db.prepare('SELECT value FROM settings WHERE key="telegram_config"').get();
console.log('Row:', row);
if (row && row.value) {
    console.log('Parsed:', JSON.parse(row.value));
}
