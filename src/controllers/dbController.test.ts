import { describe, expect, it } from 'vitest';
import { enforceScope } from './dbController.js';

describe('enforceScope', () => {
  it('does not add a location filter for sales_tasks', () => {
    const body: any = {
      action: 'select',
      table: 'sales_tasks',
      filters: [{ field: 'status', op: 'eq', value: 'open' }],
    };

    const req: any = {
      authUser: {
        role: 'sales',
        location_id: 'loc-1',
      },
    };

    enforceScope(body, req);

    expect(body.filters).toEqual([{ field: 'status', op: 'eq', value: 'open' }]);
  });
});
