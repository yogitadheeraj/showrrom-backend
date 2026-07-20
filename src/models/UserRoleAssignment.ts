import mongoose, { Document, Schema } from 'mongoose';

export interface IUserRoleAssignment extends Document {
  id: string;
  userId: string;
  role: string;
  orgId: string | null;
  businessUnitId: string | null;
  brandId: string | null;
  salesOfficeId: string | null;
  plantId: string | null;
  locationId: string | null;
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

const UserRoleAssignmentSchema = new Schema<IUserRoleAssignment>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true, index: true },
    orgId: { type: String, default: null, index: true },
    businessUnitId: { type: String, default: null, index: true },
    brandId: { type: String, default: null, index: true },
    salesOfficeId: { type: String, default: null, index: true },
    plantId: { type: String, default: null, index: true },
    locationId: { type: String, default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'user_role_assignments' },
);

UserRoleAssignmentSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

UserRoleAssignmentSchema.index({ orgId: 1, businessUnitId: 1, brandId: 1, salesOfficeId: 1, plantId: 1, locationId: 1 });

export const UserRoleAssignment =
  (mongoose.models['UserRoleAssignment'] as mongoose.Model<IUserRoleAssignment>) ||
  mongoose.model<IUserRoleAssignment>('UserRoleAssignment', UserRoleAssignmentSchema);
