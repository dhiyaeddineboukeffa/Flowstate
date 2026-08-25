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
let clientPromise: Promise<MongoClient>;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  // The maxPoolSize=2 in the URI ensures each serverless function 
  // only opens a minimal number of connections.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
