export type EstimateLineItemId =
  | 'access_at_delivery'
  | 'safety_security_requirements'
  | 'condition_check_requirements'
  | 'packing_requirements'
  | 'delivery_requirements'
  | 'movement_routing_domestic'
  | 'movement_routing_exports'
  | 'movement_routing_cross_trade'
  | 'movement_routing_imports'
  | 'customs_licences_documentation'
  | 'warehouse_viewing_services';

export interface EstimateLineItemDefinition {
  id: EstimateLineItemId;
  name: string;
  category: string;
}

export interface EstimateSubItem {
  id: string;
  name: string;
}

export const ESTIMATE_LINE_ITEM_DEFINITIONS: EstimateLineItemDefinition[] = [
  { id: 'access_at_delivery', name: 'Access at Delivery', category: 'Access at Delivery' },
  { id: 'safety_security_requirements', name: 'Safety & Security Requirements', category: 'Safety & Security Requirements' },
  { id: 'condition_check_requirements', name: 'Condition Check Requirements', category: 'Condition Check Requirements' },
  { id: 'packing_requirements', name: 'Packing Requirements', category: 'Packing Requirements' },
  { id: 'delivery_requirements', name: 'Delivery Requirements', category: 'Delivery Requirements' },
  { id: 'movement_routing_domestic', name: 'Movement Type & Routing: Domestic', category: 'Movement Type & Routing' },
  { id: 'movement_routing_exports', name: 'Movement Type & Routing: Exports', category: 'Movement Type & Routing' },
  { id: 'movement_routing_cross_trade', name: 'Movement Type & Routing: Cross Trade', category: 'Movement Type & Routing' },
  { id: 'movement_routing_imports', name: 'Movement Type & Routing: Imports', category: 'Movement Type & Routing' },
  { id: 'customs_licences_documentation', name: 'Customs, Licences & Documentation', category: 'Customs, Licences & Documentation' },
  { id: 'warehouse_viewing_services', name: 'Warehouse & Viewing Services', category: 'Warehouse & Viewing Services' },
];

export const SUB_LINE_ITEMS: Record<EstimateLineItemId, EstimateSubItem[]> = {
  delivery_requirements: [
    { id: 'ground_floor_curbside_delivery', name: 'Ground Floor/Curbside Delivery' },
    { id: 'dock_to_dock_delivery', name: 'Dock-to-Dock Delivery' },
    { id: 'unpacking_service', name: 'Unpacking Service' },
    { id: 'installation_service', name: 'Installation Service' },
    { id: 'condition_checking', name: 'Condition Checking' },
    { id: 'debris_removal', name: 'Debris Removal' },
    { id: 'white_glove_service', name: 'White Glove Service' },
  ],
  packing_requirements: [
    { id: 'existing_crate_reuse', name: 'Existing Crate (Reuse)' },
    { id: 'soft_wrap_blanket_wrap', name: 'Soft Wrap/Blanket Wrap' },
    { id: 'standard_crate', name: 'Standard Crate' },
    { id: 'single_crate', name: 'Single Crate' },
    { id: 'double_wall_crate', name: 'Double-Wall Crate' },
    { id: 'double_crate', name: 'Double Crate' },
    { id: 'museum_crate_full', name: 'Museum Crate Full' },
    { id: 'museum_crate_sub', name: 'Museum Crate Sub' },
    { id: 'climate_controlled_crate', name: 'Climate-Controlled Crate' },
    { id: 't_frame', name: '"T Frame"' },
    { id: 't_frame_handles', name: 'T Frame Handles' },
    { id: 'ply_box', name: 'Ply Box' },
    { id: 'tri_wall', name: 'Tri Wall' },
    { id: 'foam_lined', name: 'Foam Lined' },
    { id: 'crating_services', name: 'Crating Services' },
    { id: 'crate_rental', name: 'Crate Rental' },
    { id: 'pre_packed_no_service', name: 'Pre-Packed (No Service Needed)' },
  ],
  access_at_delivery: [
    { id: 'ground_floor_unrestricted_access', name: 'Ground Floor - Unrestricted Access' },
    { id: 'freight_elevator_available', name: 'Freight Elevator Available' },
    { id: 'stairs_only', name: 'Stairs Only' },
    { id: 'special_equipment_required', name: 'Special Equipment Required' },
    { id: 'loading_dock_available', name: 'Loading Dock Available' },
    { id: 'onsite_visit', name: 'Onsite Visit (pre-delivery/site survey)' },
    { id: 'parking_suspension', name: 'Parking Suspension' },
  ],
  safety_security_requirements: [
    { id: 'climate_controlled_container', name: 'Climate-Controlled Container' },
    { id: 'two_person_delivery_team', name: 'Two-Person Delivery Team' },
    { id: 'air_ride_suspension_vehicle', name: 'Air-Ride Suspension Vehicle' },
    { id: 'gps_tracking', name: 'GPS Tracking' },
    { id: 'security_escort_vehicle', name: 'Security Escort Vehicle' },
    { id: 'signature_on_delivery', name: 'Signature on Delivery' },
    { id: 'fixed_delivery_address', name: 'Fixed Delivery Address' },
    { id: 'no_redirection_allowed', name: 'No Redirection Allowed' },
    { id: 'airport_security_supervision', name: 'Airport Security Supervision' },
  ],
  condition_check_requirements: [
    { id: 'basic_condition_notes', name: 'Basic Condition Notes' },
    { id: 'pre_collection_inspection', name: 'Pre-Collection Inspection' },
    { id: 'inspection', name: 'Inspection' },
    { id: 'photo_documentation_2_plus', name: 'Photo Documentation (2+ photos)' },
    { id: 'photographs_additional', name: 'Photographs (additional/general)' },
    { id: 'comprehensive_photo_set_3_plus', name: 'Comprehensive Photo Set (3+ photos)' },
    { id: 'articheck', name: 'Articheck (digital condition reporting)' },
    { id: 'professional_condition_report', name: 'Professional Condition Report' },
    { id: 'detailed_report_with_commentary', name: 'Detailed Report with Commentary' },
    { id: 'condition_check', name: 'Condition Check' },
  ],
  movement_routing_domestic: [
    { id: 'domestic_move', name: 'Domestic Move' },
    { id: 'domestic_move_into_storage', name: 'Domestic Move Into Storage' },
    { id: 'domestic_move_out_of_storage', name: 'Domestic Move Out of Storage' },
    { id: 'emergency_art_evacuation', name: 'Emergency Art Evacuation' },
  ],
  movement_routing_exports: [
    { id: 'export_air', name: 'Export AIR' },
    { id: 'export_air_mib', name: 'Export AIR MIB' },
    { id: 'export_courier', name: 'Export Courier' },
    { id: 'export_road_dedicated', name: 'Export Road Dedicated' },
    { id: 'export_road_groupage', name: 'Export Road Groupage' },
    { id: 'export_road_agent', name: 'Export Road Agent' },
    { id: 'export_fcl', name: 'Export FCL' },
    { id: 'export_lcl', name: 'Export LCL' },
  ],
  movement_routing_cross_trade: [
    { id: 'cross_trade_air', name: 'Cross Trade AIR' },
    { id: 'cross_trade_road', name: 'Cross Trade Road' },
    { id: 'cross_trade_fcl', name: 'Cross Trade FCL' },
    { id: 'cross_trade_sea_lcl', name: 'Cross Trade Sea LCL' },
  ],
  movement_routing_imports: [
    { id: 'import_air', name: 'Import AIR' },
    { id: 'import_air_mib', name: 'Import AIR MIB' },
    { id: 'import_courier', name: 'Import Courier' },
    { id: 'import_road_dedicated', name: 'Import Road Dedicated' },
    { id: 'import_road_groupage', name: 'Import Road Groupage' },
    { id: 'import_road_agent', name: 'Import Road Agent' },
    { id: 'import_fcl', name: 'Import FCL' },
    { id: 'import_lcl', name: 'Import LCL' },
  ],
  customs_licences_documentation: [
    { id: 'export_clearance_only', name: 'Export Clearance ONLY' },
    { id: 'import_clearance_only', name: 'Import Clearance ONLY' },
    { id: 'certificate_of_origin', name: 'Certificate of Origin' },
    { id: 'export_licence', name: 'Export Licence' },
    { id: 'cites_licence', name: 'CITES Licence' },
    { id: 'notarizing_documents', name: 'Notarizing Documents' },
    { id: 'vat_and_duty', name: 'VAT & Duty' },
  ],
  warehouse_viewing_services: [
    { id: 'receive', name: 'Receive' },
    { id: 'warehouse_transfer', name: 'Warehouse Transfer' },
    { id: 'viewing_room_full_day', name: 'Viewing Room Full Day' },
    { id: 'viewing_room_half_day', name: 'Viewing Room Half Day' },
    { id: 'handout', name: 'Handout' },
  ],
};

export const createDefaultLineItems = () =>
  ESTIMATE_LINE_ITEM_DEFINITIONS.map(({ id, name, category }) => ({
    id,
    name,
    category,
    cost: '',
  }));
