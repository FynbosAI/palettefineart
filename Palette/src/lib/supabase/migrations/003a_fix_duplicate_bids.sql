-- Fix duplicate bids before applying unique constraint
-- This script identifies and resolves duplicate bids from the same partner on the same quote

-- First, let's see what duplicates exist
WITH duplicate_bids AS (
    SELECT 
        quote_id,
        logistics_partner_id,
        COUNT(*) as bid_count,
        array_agg(id ORDER BY updated_at DESC) as bid_ids,
        array_agg(status ORDER BY updated_at DESC) as statuses,
        array_agg(amount ORDER BY updated_at DESC) as amounts,
        array_agg(updated_at ORDER BY updated_at DESC) as update_times
    FROM bids
    GROUP BY quote_id, logistics_partner_id
    HAVING COUNT(*) > 1
)
SELECT 
    quote_id,
    logistics_partner_id,
    bid_count,
    bid_ids[1] as keep_bid_id,  -- Most recent bid
    bid_ids[2:] as remove_bid_ids,  -- Older bids
    statuses[1] as keep_status,
    amounts[1] as keep_amount,
    update_times[1] as keep_updated_at
FROM duplicate_bids
ORDER BY quote_id;

-- Create a backup table for the bids we're about to delete
CREATE TABLE IF NOT EXISTS bids_backup_duplicates AS
SELECT b.*, NOW() as backed_up_at, 'duplicate_removal' as backup_reason
FROM bids b
WHERE EXISTS (
    SELECT 1
    FROM (
        SELECT 
            quote_id,
            logistics_partner_id,
            ROW_NUMBER() OVER (PARTITION BY quote_id, logistics_partner_id ORDER BY updated_at DESC) as rn,
            id
        FROM bids
    ) dup
    WHERE dup.id = b.id 
    AND dup.rn > 1
);

-- Count how many duplicates we're removing
SELECT COUNT(*) as duplicates_to_remove
FROM bids b
WHERE EXISTS (
    SELECT 1
    FROM (
        SELECT 
            quote_id,
            logistics_partner_id,
            ROW_NUMBER() OVER (PARTITION BY quote_id, logistics_partner_id ORDER BY updated_at DESC) as rn,
            id
        FROM bids
    ) dup
    WHERE dup.id = b.id 
    AND dup.rn > 1
);

-- Delete the older duplicate bids (keeping the most recent one)
DELETE FROM bids
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            quote_id,
            logistics_partner_id,
            ROW_NUMBER() OVER (PARTITION BY quote_id, logistics_partner_id ORDER BY updated_at DESC) as rn
        FROM bids
    ) ranked_bids
    WHERE rn > 1
);

-- Verify no duplicates remain
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No duplicates remain'
        ELSE 'ERROR: ' || COUNT(*) || ' duplicate combinations still exist'
    END as result
FROM (
    SELECT quote_id, logistics_partner_id
    FROM bids
    GROUP BY quote_id, logistics_partner_id
    HAVING COUNT(*) > 1
) remaining_dups;

-- Now the unique constraint can be safely added
-- The main migration script will handle this