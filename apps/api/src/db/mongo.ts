import mongoose from 'mongoose';

export async function connectMongo(uri: string) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return mongoose.connection;
}
