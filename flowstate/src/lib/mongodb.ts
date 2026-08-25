import { MongoClient } from 'mongodb';

if (!process.env.DATABASE_URL) {
  throw new Error('Please add your Mongo URI to .env.local (e.g. DATABASE_URL)');
}

// Append connection limits if they aren't already present to prevent
// Vercel serverless function scaling from exhausting MongoDB connections.
let uri = process.env.DATABASE_URL;
if (!uri.includes('maxPoolSize')) {
  uri += uri.includes('?') ? '&maxPoolSize=2' : '?maxPoolSize=2';
}

const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

async function getMongoClient(): Promise<MongoClient> {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect().catch(err => {
        global._mongoClientPromise = undefined;
        throw err;
      });
    }
    return global._mongoClientPromise;
  } else {
    if (!clientPromise) {
      client = new MongoClient(uri, options);
      clientPromise = client.connect().catch(err => {
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  }
}

export default getMongoClient;
