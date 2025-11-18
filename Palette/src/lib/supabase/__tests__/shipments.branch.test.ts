import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const loadModules = async () => {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
  process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
  const { ShipmentService } = await import('../shipments');
  const { supabase } = await import('../client');
  return { ShipmentService, supabase };
};

test('ShipmentService.getShipments filters by branch org id', async () => {
  const { ShipmentService, supabase } = await loadModules();
  const originalFrom = supabase.from.bind(supabase);

  const orderMock = mock.fn(async () => ({
    data: [
      {
        id: 'shipment-1',
        name: 'Winged Victory',
        status: 'checking',
        owner_org_id: 'branch-42',
        created_at: new Date().toISOString(),
        artworks: [],
        tracking_events: [],
        documents: [],
      },
    ],
    error: null,
  }));

  const eqMock = mock.fn(() => ({
    order: orderMock,
  }));

  const selectMock = mock.fn(() => ({
    eq: eqMock,
  }));

  (supabase as any).from = mock.fn((table: string) => {
    if (table === 'shipments') {
      return { select: selectMock };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  try {
    const { data, error } = await ShipmentService.getShipments('branch-42');

    assert.equal(error, null);
    assert.ok(data);
    assert.equal(selectMock.mock.calls.length, 1);
    assert.equal(eqMock.mock.calls[0].arguments[0], 'owner_org_id');
    assert.equal(eqMock.mock.calls[0].arguments[1], 'branch-42');
    assert.equal(orderMock.mock.calls[0].arguments[0], 'created_at');
  } finally {
    (supabase as any).from = originalFrom;
  }
});
