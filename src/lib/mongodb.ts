/* eslint-disable @typescript-eslint/ban-ts-comment */
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? "";
if (!MONGODB_URI) throw new Error('MONGODB_URI not defined');

// @ts-ignore
const cached: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } = global.mongoose || { conn: null, promise: null };

// @ts-ignore
if (!global.mongoose) {
    // @ts-ignore
  global.mongoose = cached;
}

async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
