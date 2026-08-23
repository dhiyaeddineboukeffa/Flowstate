require('dotenv').config();
const { MongoClient } = require('mongodb');

async function test() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const user = await db.collection("User").findOne();
    console.log("SUCCESS:", user);
  } catch (e) {
    console.error("ERROR:", e);
  } finally {
    await client.close();
  }
}
test();
