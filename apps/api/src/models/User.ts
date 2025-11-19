import mongoose, { Schema, model, Model, Types } from 'mongoose';

export type UserRole = 'admin' | 'user';

export interface IUser {
  _id: Types.ObjectId;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash?: string;
  googleId?: string;
  avatar?: string;
  sessionVersion: number;
  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;
  resetPasswordRequestedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, unique: true, required: true, index: true },
    email: { type: String, unique: true, required: true, index: true, lowercase: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
    passwordHash: {
      type: String,
      required: function (this: any) {
        return !this.googleId; // require password only if no Google account linked
      },
    },
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: String },
    sessionVersion: { type: Number, default: 0 },
    resetPasswordTokenHash: { type: String },
    resetPasswordExpires: { type: Date },
    resetPasswordRequestedAt: { type: Date },
  },
  { timestamps: true }
);

// Ensure toJSON hides internal fields
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    const r: any = ret as any;
    r.id = r._id?.toString?.() ?? r._id;
    delete r._id;
    delete r.__v;
    delete r.passwordHash;
    delete r.resetPasswordTokenHash;
    delete r.resetPasswordExpires;
    return r;
  },
});

export const User = (mongoose.models.User as Model<IUser>) || model<IUser>('User', UserSchema);
