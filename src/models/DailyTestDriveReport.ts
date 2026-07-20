import mongoose, { Document, Schema } from 'mongoose';

export type ReportType = 'test_drive_daily' | 'activity_daily';
export type ReportStatus = 'pending' | 'sent' | 'failed';

export interface IDailyTestDriveReport extends Document {
  id: string;
  location_id: string;
  report_date: string;
  report_type: ReportType;
  recipient_email: string;
  status: ReportStatus;
  attempts: number;
  last_attempt_at: Date | null;
  sent_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

const DailyTestDriveReportSchema = new Schema<IDailyTestDriveReport>(
  {
    id: { type: String, required: true, unique: true, index: true },
    location_id: { type: String, required: true, index: true },
    report_date: { type: String, required: true, index: true },
    report_type: { type: String, enum: ['test_drive_daily', 'activity_daily'], required: true },
    recipient_email: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    last_attempt_at: { type: Date, default: null },
    sent_at: { type: Date, default: null },
    error_message: { type: String, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: 'daily_test_drive_reports' },
);

DailyTestDriveReportSchema.index({ location_id: 1, report_date: 1, report_type: 1 }, { unique: true });

export const DailyTestDriveReport =
  (mongoose.models['DailyTestDriveReport'] as mongoose.Model<IDailyTestDriveReport>) ||
  mongoose.model<IDailyTestDriveReport>('DailyTestDriveReport', DailyTestDriveReportSchema);
