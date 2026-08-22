const sqlite3 = require('sqlite3').verbose();
const { MongoClient } = require('mongodb');
const path = require('path');

const sqliteDbPath = path.join(__dirname, 'dev.db');
const mongoUri = 'mongodb+srv://boukeffadhiyaeddine_db_user:iLzhb7wsdhZPxB0b@dzin.vx0fcge.mongodb.net/flowstate?retryWrites=true&w=majority&appName=DZIN';

async function migrate() {
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const mdb = mongoClient.db();
  const db = new sqlite3.Database(sqliteDbPath);

  function getRows(query) {
    return new Promise((resolve, reject) => {
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  const tables = ['User', 'ParentTask', 'ChecklistItem', 'SubTask', 'Session'];

  for (const table of tables) {
    console.log(`Migrating ${table}...`);
    // Drop existing collection if it exists to avoid duplicate key errors on retry
    try { await mdb.collection(table).drop(); } catch(e) {}
    
    const rows = await getRows(`SELECT * FROM "${table}"`);
    if (rows.length > 0) {
      const mappedRows = rows.map(r => {
        const obj = { ...r };
        obj._id = obj.id;
        delete obj.id;
        
        for (const key in obj) {
          if (obj[key] !== null) {
            if (['pomodoroMode', 'done', 'is_paused'].includes(key)) {
              obj[key] = obj[key] === 1 || obj[key] === true || obj[key] === 'true';
            }
            if (['created_at', 'breakStartTime', 'start_time', 'end_time', 'last_paused_at'].includes(key)) {
              obj[key] = new Date(obj[key]);
            }
          }
        }
        return obj;
      });
      await mdb.collection(table).insertMany(mappedRows);
    }
    console.log(`Migrated ${rows.length} rows for ${table}`);
  }

  await mongoClient.close();
  db.close();
  console.log('Migration complete!');
}

migrate().catch(console.error);
