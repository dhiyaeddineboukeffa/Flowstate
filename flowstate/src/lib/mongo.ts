import { MongoClient } from "mongodb";

// Fallback to local MongoDB if the user removes their cluster for some reason
const uri = process.env.MONGO_URI || process.env.DATABASE_URL?.replace("file:./dev.db", "") || "mongodb://localhost:27017";

const options = {};
let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getDb() {
  const client = await clientPromise;
  // Use the default db in the URI (e.g. flowstate)
  return client.db();
}

export default clientPromise;
