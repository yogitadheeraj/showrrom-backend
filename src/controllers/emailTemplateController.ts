import { Request, Response } from 'express';
import { Dealer } from '../models/Dealer.js';
import { EmailTemplateCustomization } from '../models/EmailTemplateCustomization.js';
import { renderEmailTemplate, EMAIL_TEMPLATES } from '../templates/emailTemplates.js';

// Sample preview data for each template
const PREVIEW_DATA: Record<string, Record<string, unknown>> = {
  default: {
    customerName: 'Rahul Sharma',
    vehicleName: 'Hyundai Creta',
    locationName: 'Autozone Delhi',
    scheduledDate: 'June 20, 2026',
    scheduledTime: '11:00 AM',
    salesPersonName: 'Priya Kapoor',
    salesPersonPhone: '+91 98765 43210',
    newDate: 'June 22, 2026',
    newTime: '2:00 PM',
    durationMinutes: 45,
    totalDurationMinutes: 45,
    rating: 4,
    feedbackText: 'Great experience, very professional team!',
    fullName: 'Priya Kapoor',
    roleLabel: 'Sales Person',
    followUpNote: 'Just checking in on your test drive experience!',
    oldVehicle: 'Maruti Swift',
    newVehicle: 'Hyundai Creta',
    contactName: 'Manager',
    wouldRecommend: true,
    currentStatus: 'completed',
    feedbackLink: '#',
    bookingUrl: '#',
    manageUrl: '#',
    verificationLink: '#',
    loginUrl: '#',
    submittedAt: new Date().toLocaleString(),
    experienceBadge: 'Smooth',
  },
};

export async function previewEmailTemplateController(req: Request, res: Response) {
  try {
    const templateKey = req.query.template as string;
    const dealerId = req.query.dealer_id as string | undefined;

    if (!templateKey || !EMAIL_TEMPLATES[templateKey]) {
      res.status(400).json({ data: null, error: { message: `Unknown template: ${templateKey}` } });
      return;
    }

    // Resolve dealer branding
    let brandingFields: Record<string, unknown> = {};
    if (dealerId) {
      const dealer = await Dealer.findOne({ id: dealerId }, { name: 1, logo_url: 1 }).lean();
      if (dealer) {
        brandingFields = {
          _dealerName: (dealer as any).name || undefined,
          _dealerLogoUrl: (dealer as any).logo_url || undefined,
        };
      }
    }

    const previewData = { ...PREVIEW_DATA.default, ...brandingFields };
    const rendered = renderEmailTemplate(templateKey, previewData);

    // Apply any saved customizations for this dealer
    let subject = rendered.subject;
    let html = rendered.html;
    if (dealerId) {
      const custom = await EmailTemplateCustomization.findOne(
        { dealer_id: dealerId, template_key: templateKey },
        { subject_override: 1, body_override: 1 },
      ).lean();
      if (custom) {
        if ((custom as any).subject_override) subject = (custom as any).subject_override;
        if ((custom as any).body_override) html = (custom as any).body_override;
      }
    }

    res.status(200).json({ data: { html, subject, defaultHtml: rendered.html, defaultSubject: rendered.subject }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}
