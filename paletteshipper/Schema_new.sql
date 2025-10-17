/*
============================================================================
 Enhanced Schema Analysis for Dynamic Bid/Shipment Changes Assessment
 FIXED VERSION - Resolves nested aggregate function error
============================================================================
*/
WITH
-- =========================================================================
-- 1. Database schema with detailed column info
-- =========================================================================
database_schema AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name',      t.table_name,
               'column_name',     c.column_name,
               'data_type',       c.data_type,
               'is_nullable',     c.is_nullable,
               'column_default',  c.column_default,
               'ordinal_position', c.ordinal_position,
               'character_maximum_length', c.character_maximum_length,
               'numeric_precision', c.numeric_precision,
               'udt_name',        c.udt_name  -- For custom types/enums
             ) ORDER BY t.table_name, c.ordinal_position
           ) AS data
    FROM information_schema.tables  t
    JOIN information_schema.columns c
      ON c.table_name = t.table_name
     AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public'
      AND t.table_type   = 'BASE TABLE'
),
-- =========================================================================
-- 2. Foreign key relationships (critical for understanding dependencies)
-- =========================================================================
foreign_keys AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'constraint_name', tc.constraint_name,
               'table_name',      tc.table_name,
               'column_name',     kcu.column_name,
               'foreign_table_name', ccu.table_name,
               'foreign_column_name', ccu.column_name,
               'update_rule',     rc.update_rule,
               'delete_rule',     rc.delete_rule
             )
           ) AS data
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
),
-- =========================================================================
-- 3. Primary keys and unique constraints (FIXED)
-- =========================================================================
key_constraints AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name',      table_name,
               'constraint_name', constraint_name,
               'constraint_type', constraint_type,
               'columns',         columns
             )
           ) AS data
    FROM (
        SELECT 
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type,
            string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.constraint_schema = tc.constraint_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
        GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
    ) grouped_constraints
),
-- =========================================================================
-- 4. Check constraints (for validations)
-- =========================================================================
check_constraints AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name',      tc.table_name,
               'constraint_name', tc.constraint_name,
               'check_clause',    cc.check_clause
             )
           ) AS data
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON cc.constraint_name = tc.constraint_name
     AND cc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'CHECK'
),
-- =========================================================================
-- 5. Indexes with detailed info
-- =========================================================================
indexes AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name', pi.tablename,
               'index_name', pi.indexname,
               'is_unique',  pi.indexdef LIKE '%UNIQUE%',
               'is_primary', pi.indexname LIKE '%_pkey',
               'definition', pi.indexdef,
               'columns',    regexp_replace(
                              regexp_replace(pi.indexdef, '.*\((.*)\).*', '\1'),
                              '"', '', 'g'
                            )
             )
           ) AS data
    FROM pg_indexes pi
    WHERE schemaname = 'public'
),
-- =========================================================================
-- 6. Enum types (for status fields) - FIXED
-- =========================================================================
enum_types AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'type_name', type_name,
               'values',    values
             )
           ) AS data
    FROM (
        SELECT 
            t.typname as type_name,
            string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
    ) enum_list
),
-- =========================================================================
-- 7. Triggers (for automated actions)
-- =========================================================================
triggers AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'trigger_name',    tg.tgname,
               'table_name',      t.relname,
               'event',          CASE 
                                   WHEN tg.tgtype & 2 = 2 THEN 'BEFORE'
                                   ELSE 'AFTER'
                                 END || ' ' ||
                                 CASE 
                                   WHEN tg.tgtype & 4 = 4 THEN 'INSERT'
                                   WHEN tg.tgtype & 8 = 8 THEN 'DELETE'
                                   WHEN tg.tgtype & 16 = 16 THEN 'UPDATE'
                                   ELSE 'TRUNCATE'
                                 END,
               'function_name',   p.proname,
               'enabled',        tg.tgenabled = 'O'
             )
           ) AS data
    FROM pg_trigger tg
    JOIN pg_class t ON tg.tgrelid = t.oid
    JOIN pg_proc p ON tg.tgfoid = p.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND NOT tg.tgisinternal
),
-- =========================================================================
-- 8. RLS policies with details
-- =========================================================================
rls_policies AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name', tablename,
               'policy_name', policyname,
               'permissive',  permissive,
               'roles',       roles,
               'command',     cmd,
               'using_qual',  qual,
               'with_check',  with_check
             )
           ) AS data
    FROM pg_policies
    WHERE schemaname = 'public'
),
-- =========================================================================
-- 9. RLS status per table
-- =========================================================================
rls_status AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name', tablename,
               'row_security', rowsecurity
             )
           ) AS data
    FROM pg_tables
    WHERE schemaname = 'public'
),
-- =========================================================================
-- 10. Table sizes and row counts (for performance assessment)
-- =========================================================================
table_stats AS (
    SELECT jsonb_agg(
             jsonb_build_object(
               'table_name', relname,
               'row_count',  n_live_tup,
               'dead_rows',  n_dead_tup,
               'last_vacuum', last_vacuum,
               'last_analyze', last_analyze
             )
           ) AS data
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
),
-- =========================================================================
-- 11. Specific tables relevant to bid/shipment changes
-- =========================================================================
relevant_tables AS (
    SELECT jsonb_build_object(
        'quotes_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'quotes' AND table_schema = 'public'),
        'bids_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'bids' AND table_schema = 'public'),
        'shipments_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'shipments' AND table_schema = 'public'),
        'shipment_change_requests_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'shipment_change_requests' AND table_schema = 'public'),
        'bid_line_items_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'bid_line_items' AND table_schema = 'public'),
        'locations_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'locations' AND table_schema = 'public'),
        'organizations_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public'),
        'logistics_partners_exists', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'logistics_partners' AND table_schema = 'public')
    ) AS data
),
-- =========================================================================
-- 12. Column existence check for proposed changes
-- =========================================================================
proposed_columns AS (
    SELECT jsonb_build_object(
        'shipments_cancelled_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'cancelled_at' AND table_schema = 'public'),
        'shipments_cancelled_by', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'cancelled_by' AND table_schema = 'public'),
        'shipments_cancellation_reason', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'shipments' AND column_name = 'cancellation_reason' AND table_schema = 'public'),
        'bids_needs_confirmation_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bids' AND column_name = 'needs_confirmation_at' AND table_schema = 'public'),
        'bids_confirmed_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bids' AND column_name = 'confirmed_at' AND table_schema = 'public'),
        'bids_revision', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bids' AND column_name = 'revision' AND table_schema = 'public'),
        'bids_shortlisted_by', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bids' AND column_name = 'shortlisted_by' AND table_schema = 'public'),
        'bids_shortlisted_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'bids' AND column_name = 'shortlisted_at' AND table_schema = 'public')
    ) AS data
)

-- Final unified output
-- =========================================================================
SELECT section, data
FROM (
    SELECT 'relevant_tables' AS section, data, 1 AS sort_index FROM relevant_tables
    UNION ALL
    SELECT 'proposed_columns', data, 2 FROM proposed_columns
    UNION ALL
    SELECT 'database_schema', data, 3 FROM database_schema
    UNION ALL
    SELECT 'foreign_keys', data, 4 FROM foreign_keys
    UNION ALL
    SELECT 'key_constraints', data, 5 FROM key_constraints
    UNION ALL
    SELECT 'check_constraints', data, 6 FROM check_constraints
    UNION ALL
    SELECT 'indexes', data, 7 FROM indexes
    UNION ALL
    SELECT 'enum_types', data, 8 FROM enum_types
    UNION ALL
    SELECT 'triggers', data, 9 FROM triggers
    UNION ALL
    SELECT 'rls_policies', data, 10 FROM rls_policies
    UNION ALL
    SELECT 'rls_status', data, 11 FROM rls_status
    UNION ALL
    SELECT 'table_stats', data, 12 FROM table_stats
) unified
ORDER BY sort_index;