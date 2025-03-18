/* eslint-disable @typescript-eslint/ban-ts-comment */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? "";
if (!MONGODB_URI) throw new Error('MONGODB_URI not defined');

// Connection options optimized for high concurrency
const options: mongoose.ConnectOptions = {
  maxPoolSize: 100, // Increase connection pool size for high concurrency
  minPoolSize: 10,  // Maintain minimum connections for better performance
  socketTimeoutMS: 45000, // Prevent hanging connections
  serverSelectionTimeoutMS: 30000, // Allow time for server selection in clustered setups
  heartbeatFrequencyMS: 10000, // More frequent heartbeats to detect issues
  retryWrites: true, // Automatically retry failed writes
  connectTimeoutMS: 30000, // Timeout for initial connection
};

// Cached connection object
// @ts-ignore
const cached: { 
  conn: typeof mongoose | null; 
  promise: Promise<typeof mongoose> | null;
  isConnecting: boolean;
  retries: number;
  // @ts-ignore
} = global.mongoose || { 
  conn: null, 
  promise: null,
  isConnecting: false,
  retries: 0
};

// @ts-ignore
if (!global.mongoose) {
  // @ts-ignore
  global.mongoose = cached;
}

// Maximum number of connection retries
const MAX_RETRIES = 3;

/**
 * Connect to MongoDB with retry logic and connection pooling
 * Optimized for handling 20,000+ concurrent users
 */
async function dbConnect(): Promise<typeof mongoose> {
  // If we already have a connection, return it
  if (cached.conn) {
    return cached.conn;
  }

  // If connection is in progress, wait for it
  if (cached.promise && cached.isConnecting) {
    return cached.promise;
  }

  // If we've hit max retries and still have no connection, reset retry counter
  if (cached.retries >= MAX_RETRIES) {
    cached.retries = 0;
    cached.promise = null;
  }

  try {
    cached.isConnecting = true;

    // Create new connection promise if none exists
    if (!cached.promise) {
      console.log(`MongoDB connection attempt ${cached.retries + 1}/${MAX_RETRIES + 1}`);
      cached.promise = mongoose.connect(MONGODB_URI, options).then((mongoose) => {
        console.log('MongoDB connected successfully');
        return mongoose;
      });
    }

    // Wait for connection
    cached.conn = await cached.promise;
    cached.isConnecting = false;
    cached.retries = 0;

    // Setup connection event listeners for monitoring
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
      cached.conn = null;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Reconnecting on next request.');
      cached.conn = null;
      cached.promise = null;
    });

    return cached.conn;

  } catch (error) {
    // Handle connection error with retry logic
    cached.isConnecting = false;
    cached.promise = null;
    cached.retries += 1;

    console.error(`MongoDB connection error (attempt ${cached.retries}/${MAX_RETRIES}):`, error);

    // If we have retries left, recursively try again
    if (cached.retries < MAX_RETRIES) {
      console.log(`Retrying MongoDB connection in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      return dbConnect();
    }

    // If we've exhausted retries, throw the error
    throw error;
  }
}

export default dbConnect;