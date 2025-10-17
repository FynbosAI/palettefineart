-- RLS Policies for Enhanced Quote-Bid-Shipment Schema
-- This migration adds Row Level Security policies for the new tables

-- Enable RLS on new tables
ALTER TABLE quote_artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_shipment_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_audit_events ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- QUOTE ARTWORKS POLICIES
-- =====================================================

-- Gallery (client) users can view their own quote artworks
CREATE POLICY "Clients can view their quote artworks"
  ON quote_artworks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN organizations o ON q.owner_org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE q.id = quote_artworks.quote_id
      AND m.user_id = auth.uid()
      AND o.type = 'client'
    )
  );

-- Partner users can view artworks for quotes they're invited to
CREATE POLICY "Partners can view artworks for invited quotes"
  ON quote_artworks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quote_invites qi
      JOIN logistics_partners lp ON qi.logistics_partner_id = lp.id
      JOIN organizations o ON lp.org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE qi.quote_id = quote_artworks.quote_id
      AND m.user_id = auth.uid()
      AND o.type = 'partner'
    )
  );

-- Only quote owners can insert artworks
CREATE POLICY "Clients can insert quote artworks"
  ON quote_artworks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN organizations o ON q.owner_org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE q.id = quote_artworks.quote_id
      AND m.user_id = auth.uid()
      AND m.role IN ('editor', 'admin')
      AND o.type = 'client'
    )
  );

-- Only quote owners can update unlocked artworks
CREATE POLICY "Clients can update unlocked quote artworks"
  ON quote_artworks
  FOR UPDATE
  USING (
    locked_at IS NULL
    AND EXISTS (
      SELECT 1 FROM quotes q
      JOIN organizations o ON q.owner_org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE q.id = quote_artworks.quote_id
      AND m.user_id = auth.uid()
      AND m.role IN ('editor', 'admin')
      AND o.type = 'client'
    )
  );

-- Only quote owners can delete unlocked artworks
CREATE POLICY "Clients can delete unlocked quote artworks"
  ON quote_artworks
  FOR DELETE
  USING (
    locked_at IS NULL
    AND EXISTS (
      SELECT 1 FROM quotes q
      JOIN organizations o ON q.owner_org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE q.id = quote_artworks.quote_id
      AND m.user_id = auth.uid()
      AND m.role IN ('editor', 'admin')
      AND o.type = 'client'
    )
  );

-- =====================================================
-- QUOTE SHIPMENT MAP POLICIES
-- =====================================================

-- Only organization members can view their mappings
CREATE POLICY "Organization members can view quote shipment mappings"
  ON quote_shipment_map
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN memberships m ON m.org_id = q.owner_org_id
      WHERE q.id = quote_shipment_map.quote_id
      AND m.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM shipments s
      JOIN memberships m ON m.org_id = s.owner_org_id
      WHERE s.id = quote_shipment_map.shipment_id
      AND m.user_id = auth.uid()
    )
  );

-- System creates mappings via functions
CREATE POLICY "System can insert quote shipment mappings"
  ON quote_shipment_map
  FOR INSERT
  WITH CHECK (true); -- Controlled by functions

-- =====================================================
-- AUDIT LOG POLICIES
-- =====================================================

-- Only organization admins can view their audit logs
CREATE POLICY "Admins can view organization audit logs"
  ON audit_log
  FOR SELECT
  USING (
    -- Check if user is admin of an organization that owns the record
    EXISTS (
      SELECT 1 
      FROM memberships m
      WHERE m.user_id = auth.uid()
      AND m.role = 'admin'
      AND (
        -- For quotes
        (audit_log.table_name = 'quotes' AND EXISTS (
          SELECT 1 FROM quotes q 
          WHERE q.id = audit_log.record_id::uuid 
          AND q.owner_org_id = m.org_id
        ))
        -- For shipments
        OR (audit_log.table_name = 'shipments' AND EXISTS (
          SELECT 1 FROM shipments s 
          WHERE s.id = audit_log.record_id::uuid 
          AND s.owner_org_id = m.org_id
        ))
        -- For bids (check through quotes)
        OR (audit_log.table_name = 'bids' AND EXISTS (
          SELECT 1 FROM bids b
          JOIN quotes q ON b.quote_id = q.id
          WHERE b.id = audit_log.record_id::uuid 
          AND q.owner_org_id = m.org_id
        ))
      )
    )
  );

-- =====================================================
-- QUOTE AUDIT EVENTS POLICIES
-- =====================================================

-- Organization members can view their quote audit events
CREATE POLICY "Organization members can view quote audit events"
  ON quote_audit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
      AND m.org_id = quote_audit_events.organization_id
    )
  );

-- System creates audit events
CREATE POLICY "System can insert quote audit events"
  ON quote_audit_events
  FOR INSERT
  WITH CHECK (true); -- Controlled by functions and triggers

-- =====================================================
-- UPDATE EXISTING POLICIES FOR PARTNER ISOLATION
-- =====================================================

-- Drop existing bid policies if they exist
DROP POLICY IF EXISTS "Partners can view bids" ON bids;
DROP POLICY IF EXISTS "Partners can create bids" ON bids;
DROP POLICY IF EXISTS "Partners can update bids" ON bids;

-- Partners can only see their own bids
CREATE POLICY "Partners can view their own bids"
  ON bids
  FOR SELECT
  USING (
    -- Partner can see their own bids
    EXISTS (
      SELECT 1 FROM logistics_partners lp
      JOIN organizations o ON lp.org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE lp.id = bids.logistics_partner_id
      AND m.user_id = auth.uid()
      AND o.type = 'partner'
    )
    -- OR client can see all bids on their quotes
    OR EXISTS (
      SELECT 1 FROM quotes q
      JOIN organizations o ON q.owner_org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE q.id = bids.quote_id
      AND m.user_id = auth.uid()
      AND o.type = 'client'
    )
  );

-- Partners can only create bids for their organization
CREATE POLICY "Partners can create their own bids"
  ON bids
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM logistics_partners lp
      JOIN organizations o ON lp.org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE lp.id = bids.logistics_partner_id
      AND m.user_id = auth.uid()
      AND m.role IN ('editor', 'admin')
      AND o.type = 'partner'
    )
  );

-- Partners can only update their own bids
CREATE POLICY "Partners can update their own bids"
  ON bids
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM logistics_partners lp
      JOIN organizations o ON lp.org_id = o.id
      JOIN memberships m ON m.org_id = o.id
      WHERE lp.id = bids.logistics_partner_id
      AND m.user_id = auth.uid()
      AND m.role IN ('editor', 'admin')
      AND o.type = 'partner'
    )
  );

-- =====================================================
-- FUNCTION TO CHECK USER TYPE
-- =====================================================

-- Helper function to check if user is a partner
CREATE OR REPLACE FUNCTION is_partner_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships m
    JOIN organizations o ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
    AND o.type = 'partner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is a client
CREATE OR REPLACE FUNCTION is_client_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships m
    JOIN organizations o ON m.org_id = o.id
    WHERE m.user_id = auth.uid()
    AND o.type = 'client'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION is_partner_user() TO authenticated;
GRANT EXECUTE ON FUNCTION is_client_user() TO authenticated;