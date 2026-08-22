const { MongoClient } = require('mongodb');

async function test(password) {
  const uri = `mongodb+srv://boukeffadhiyaeddine_db_user:${password}@dzin.vx0fcge.mongodb.net/?appName=DZIN`;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log(`Success with password: ${password}`);
    await client.close();
    process.exit(0);
  } catch (e) {
    console.error(`Failed with password: ${password}`);
    console.error(e.message);
  }
}

async function run() {
  await test('sgcefucs');
  await test('c51b3fc2-4b03-45fc-8a33-0075a0149aa9');
  process.exit(1);
}

run();
