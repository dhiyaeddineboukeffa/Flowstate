import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const client = await MongoClient.connect(process.env.DATABASE_URL!);
  const db = client.db("flowstate");

  const users = await db.collection("User").find({}).toArray();
  for (const user of users) {
    console.log(`User: ${user.username}, ID: ${user._id} (type: ${typeof user._id}), isValid: ${client.topology ? 'connected' : ''}`);
  }
  
  await client.close();
}

main();
