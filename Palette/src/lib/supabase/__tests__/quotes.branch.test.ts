import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const loadModules = async () => {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
  process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key';
  const { QuoteService } = await import('../quotes');
  const { supabase } = await import('../client');
  return { QuoteService, supabase };
};

test('QuoteService.getQuotes filters by branch and attaches company metadata', async () => {
  const { QuoteService, supabase } = await loadModules();
  const originalFrom = supabase.from.bind(supabase);

  const quotesOrderMock = mock.fn(async () => ({
    data: [
      {
        id: 'quote-1',
        title: 'Branch Quote',
        owner_org_id: 'branch-1',
        bids: [],
        quote_artworks: [],
        created_at: new Date().toISOString(),
      },
    ],
    error: null,
  }));

  const quotesEqMock = mock.fn(() => ({
    order: quotesOrderMock,
  }));

  const quotesSelectMock = mock.fn(() => ({
    eq: quotesEqMock,
  }));

  const branchRows = [
    {
      id: 'branch-1',
      name: 'Gallery Branch',
      type: 'client',
      created_at: new Date().toISOString(),
      img_url: null,
      parent_org_id: 'company-1',
      branch_name: 'Downtown',
      branch_location_id: null,
    },
  ];

  const companyRows = [
    {
      id: 'company-1',
      name: 'Gallery Company',
      type: 'client',
      created_at: new Date().toISOString(),
      img_url: null,
      parent_org_id: null,
      branch_name: null,
      branch_location_id: null,
    },
  ];

  const orgBranchSelectMock = mock.fn(() => ({
    in: mock.fn(async () => ({ data: branchRows, error: null })),
  }));

  const orgCompanySelectMock = mock.fn(() => ({
    in: mock.fn(async () => ({ data: companyRows, error: null })),
  }));

  const orgBuilderQueue = [
    { select: orgBranchSelectMock },
    { select: orgCompanySelectMock },
  ];

  (supabase as any).from = mock.fn((table: string) => {
    if (table === 'quotes') {
      return { select: quotesSelectMock };
    }
    if (table === 'organizations') {
      const builder = orgBuilderQueue.shift();
      if (!builder) {
        throw new Error('Unexpected organizations fetch');
      }
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  try {
    const { data, error } = await QuoteService.getQuotes('branch-1');

    assert.equal(error, null);
    assert.ok(data);
    assert.equal(quotesSelectMock.mock.calls.length, 1);
    assert.equal(quotesEqMock.mock.calls[0].arguments[0], 'owner_org_id');
    assert.equal(quotesEqMock.mock.calls[0].arguments[1], 'branch-1');

    const quote = data![0] as any;
    assert.equal(quote.owner_org?.id, 'branch-1');
    assert.equal(quote.owner_org?.branch_name, 'Downtown');
    assert.equal(quote.owner_org?.company_id, 'company-1');
    assert.equal(quote.owner_org?.company?.name, 'Gallery Company');
  } finally {
    (supabase as any).from = originalFrom;
  }
});
