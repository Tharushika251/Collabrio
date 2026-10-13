import mongoose from 'mongoose';

/**
 * Establishes a MongoDB connection using Mongoose.
 * Exits the process on failure to prevent the server from running
 * in an inconsistent state.
 */
export async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[db] MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('[db] Connection error:', err.message);
    process.exit(1);
  }
}