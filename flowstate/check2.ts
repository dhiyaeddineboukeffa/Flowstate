import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const c = await MongoClient.connect(process.env.DATABASE_URL!);
  const db = c.db("flowstate");
  const p = await db.collection("ParentTask").findOne({});
  console.log("ParentTask _id:", p?._id, typeof p?._id, "user_id:", p?.user_id, typeof p?.user_id);
  const s = await db.collection("SubTask").findOne({});
  console.log("SubTask _id:", s?._id, typeof s?._id, "parent:", s?.parent_task_id, typeof s?.parent_task_id);
  await c.close();
}

main();
