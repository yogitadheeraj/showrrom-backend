import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailTemplateCustomization extends Document {
  id: string;
  dealer_id: string;
  template_key: string;
  subject_override: string | null;
  body_override: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const EmailTemplateCustomizationSchema = new Schema<IEmailTemplateCustomization>(
  {
    id: { type: String, required: true, unique: true, index: true },
    dealer_id: { type: String, required: true, index: true },
    template_key: { type: String, required: true },
    subject_override: { type: String, default: null },
    body_override: { type: String, default: null },
    is_enabled: { type: Boolean, default: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'email_template_customizations' },
);

EmailTemplateCustomizationSchema.index({ dealer_id: 1, template_key: 1 }, { unique: true });

EmailTemplateCustomizationSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

export const EmailTemplateCustomization =
  (mongoose.models['EmailTemplateCustomization'] as mongoose.Model<IEmailTemplateCustomization>) ||
  mongoose.model<IEmailTemplateCustomization>('EmailTemplateCustomization', EmailTemplateCustomizationSchema);
