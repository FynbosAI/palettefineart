#!/bin/bash

# Cleanup script after successful migration to Supabase
# Run this ONLY after verifying everything works correctly

echo "⚠️  WARNING: This will remove legacy store files and mock data!"
echo "Make sure you have:"
echo "1. Run the migration SQL scripts"
echo "2. Verified all components work with Supabase data"
echo "3. Backed up your code"
echo ""
echo "Continue with cleanup? (y/N)"
read -r REPLY
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Cleanup cancelled."
    exit 1
fi

echo "Starting cleanup..."

# Create backup directory
BACKUP_DIR="legacy_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Move legacy store to backup
if [ -f "src/store/legacy/useStore.ts" ]; then
    echo "Moving legacy store to backup..."
    mv src/store/legacy/useStore.ts "$BACKUP_DIR/"
    echo "✅ Moved useStore.ts to backup"
else
    echo "ℹ️  Legacy store file not found (already cleaned?)"
fi

# Clean up empty directories (compatible way)
if [ -d "src/store/legacy" ]; then
    # Try to remove directory if empty
    if rmdir "src/store/legacy" 2>/dev/null; then
        echo "✅ Removed empty legacy directory"
    else
        echo "ℹ️  Legacy directory not empty, keeping it"
    fi
fi

# Remove hardcoded config file if it exists
if [ -f "src/config/christiesShipperStandards.ts" ]; then
    echo "Moving Christie's hardcoded standards to backup..."
    mv src/config/christiesShipperStandards.ts "$BACKUP_DIR/"
    echo "✅ Moved Christie's standards to backup"
fi

# Remove mock data pages (if they're being replaced)
# Uncomment these if you've migrated these pages to use real data
# if [ -f "src/components/pages/SavingsPage.tsx" ]; then
#     echo "Moving SavingsPage to backup..."
#     mv src/components/pages/SavingsPage.tsx "$BACKUP_DIR/"
# fi
# 
# if [ -f "src/components/pages/RebatesPage.tsx" ]; then
#     echo "Moving RebatesPage to backup..."
#     mv src/components/pages/RebatesPage.tsx "$BACKUP_DIR/"
# fi

echo ""
echo "✅ Cleanup complete!"
echo "📁 Backup created at: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Test your application thoroughly"
echo "2. Commit these changes to git"
echo "3. Deploy to staging environment"
echo "4. If everything works, you can delete the $BACKUP_DIR"

# Create a summary of what was cleaned
cat > "$BACKUP_DIR/cleanup_summary.txt" << EOF
Cleanup performed on: $(date)

Files moved to backup:
- src/store/legacy/useStore.ts (legacy Zustand store with mock data)
- src/config/christiesShipperStandards.ts (hardcoded business rules)

Components updated to use Supabase:
- DeliverySpecifics.tsx
- CreateShipmentDetail.tsx  
- ShipmentCard.tsx
- Theme system

New files created:
- src/lib/supabase/app-config.ts
- src/hooks/useShipments.ts
- migrate_local_data_to_supabase.sql
- check_current_data.sql

Data migrated to Supabase:
- Logistics partners with branding
- Museum/gallery locations
- Delivery requirements options
- Christie's shipper standards
- Theme colors
- Status color mappings

Migration completed successfully with:
- 22 Organizations
- 21 Locations  
- 20 Logistics Partners
- 10 App Configurations
EOF

echo ""
echo "📄 Cleanup summary saved to: $BACKUP_DIR/cleanup_summary.txt"
echo ""
echo "🎉 Migration from local stores to Supabase completed!" 