import mongoose, { Document, Schema } from 'mongoose';

export type AppRole =
  | 'superadmin'
  | 'super_admin'
  | 'dealer_admin'
  | 'sales_admin'
  | 'branch_admin'
  | 'gro'
  | 'sales'
  | 'security'
  | 'reporting';

export interface IUserRole extends Document {
  id: string;
  user_id: string;
  role: AppRole;
}

const UserRoleSchema = new Schema<IUserRole>(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, unique: true, index: true },
    role: {
      type: String,
      required: true,
      enum: ['superadmin', 'super_admin', 'dealer_admin', 'sales_admin', 'branch_admin', 'gro', 'sales', 'security', 'reporting'],
    },
  },
  { versionKey: false, collection: 'user_roles' },
);

export const UserRole =
  (mongoose.models['UserRole'] as mongoose.Model<IUserRole>) ||
  mongoose.model<IUserRole>('UserRole', UserRoleSchema);
