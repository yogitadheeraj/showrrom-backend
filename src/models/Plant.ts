import mongoose, { Document, Schema } from 'mongoose';

export interface IPlant extends Document {
  id: string;
  orgId: string;
  businessUnitId: string;
  salesOfficeId: string;
  plantCode: string;
  externalPlantId: string | null;
  name: string;
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

const PlantSchema = new Schema<IPlant>(
  {
    id: { type: String, required: true, unique: true, index: true },
    orgId: { type: String, required: true, index: true },
    businessUnitId: { type: String, required: true, index: true },
    salesOfficeId: { type: String, required: true, index: true },
    plantCode: { type: String, required: true, unique: true, index: true },
    externalPlantId: { type: String, default: null, unique: true, sparse: true, index: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'plants' },
);

PlantSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

PlantSchema.index({ orgId: 1, businessUnitId: 1, salesOfficeId: 1 });

export const Plant =
  (mongoose.models['Plant'] as mongoose.Model<IPlant>) ||
  mongoose.model<IPlant>('Plant', PlantSchema);
