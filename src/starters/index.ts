// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The starter gallery: construction templates to begin from. Each is plain .reb source.

import handover from './handover-certificate.reb?raw';
import inspection from './inspection-checklist.reb?raw';
import permit from './permit-to-work.reb?raw';
import estimate from './price-estimate.reb?raw';
import diary from './site-diary.reb?raw';
import snags from './snag-list.reb?raw';
import toolbox from './toolbox-talk.reb?raw';
import delivery from './material-delivery.reb?raw';
import rfi from './request-for-information.reb?raw';
import equipment from './equipment-inspection.reb?raw';

export interface Starter {
  id: string;
  name: string;
  description: string;
  tags: string[];
  source: string;
}

export const STARTERS: Starter[] = [
  { id: 'permit-to-work', name: 'Permit to work', description: 'Hot work, confined space and electrical permits with conditional controls and two signatures.', tags: ['safety'], source: permit },
  { id: 'site-diary', name: 'Site diary', description: 'Weather, workforce by trade, work done, delays and photos for one day.', tags: ['daily'], source: diary },
  { id: 'inspection-checklist', name: 'Inspection checklist', description: 'Pass or fail checks with photos, an overall result and a re-inspection date.', tags: ['quality'], source: inspection },
  { id: 'snag-list', name: 'Snag list', description: 'Defects by location, trade and priority, on landscape pages.', tags: ['quality', 'handover'], source: snags },
  { id: 'handover-certificate', name: 'Handover certificate', description: 'A formal certificate with your logo, the scope, exceptions and both signatures.', tags: ['handover'], source: handover },
  { id: 'price-estimate', name: 'Price estimate', description: 'Line items with computed amounts, VAT and a total in your currency.', tags: ['commercial'], source: estimate },
  { id: 'toolbox-talk', name: 'Toolbox talk', description: 'A safety briefing with key points and signed attendance.', tags: ['safety'], source: toolbox },
  { id: 'material-delivery', name: 'Material delivery', description: 'Record delivered quantities, material condition, discrepancies and receipt photos.', tags: ['daily', 'commercial'], source: delivery },
  { id: 'request-for-information', name: 'Request for information', description: 'Ask for a drawing or design clarification, track its impact and record the response.', tags: ['quality', 'commercial'], source: rfi },
  { id: 'equipment-inspection', name: 'Equipment inspection', description: 'Equipment checks with a photo per row, out-of-service defects and inspector sign-off.', tags: ['safety', 'quality'], source: equipment },
];

export const BLANK_SOURCE = `<reb-tailwind></reb-tailwind>

<h1 class="text-2xl font-bold">{{.Name}}</h1>
<p class="text-sm text-slate-500">{{.Reference}}</p>

<p class="mt-6"><reb-text name="first_field" label="First field"></reb-text></p>
`;
