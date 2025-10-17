import React, { useState, useEffect, useMemo } from 'react';
import { Chip, FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions, InputLabel, OutlinedInput } from '@mui/material';
import Box from '@mui/material/Box';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { Theme, useTheme } from '@mui/material/styles';
import { 
  LocalShipping as DeliveryIcon,
  Inventory2 as PackageIcon,
  Build as InstallIcon,
  CleaningServices as CleanIcon,
  Star as PremiumIcon,
  Apartment as BuildingIcon,
  Elevator as ElevatorIcon,
  Stairs as StairsIcon,
  Engineering as EngineeringIcon,
  Construction as CraneIcon,
  Visibility as InspectIcon,
  AcUnit as ClimateIcon,
  People as TeamIcon,
  DirectionsCar as VehicleIcon,
  GpsFixed as GpsIcon,
  Security as SecurityIcon,
  Assignment as SignatureIcon,
  LocationOn as LocationIcon,
  Block as BlockIcon,
  FlightTakeoff as AirportIcon,
  CheckCircle as InspectionIcon,
  Note as NotesIcon,
  CameraAlt as PhotoIcon,
  PhotoLibrary as PhotoSetIcon,
  Description as ReportIcon,
  Comment as CommentIcon,
  Archive as ExistingCrateIcon,
  AllInclusive as WrapIcon,
  Inventory as StandardCrateIcon,
  ViewModule as DoubleCrateIcon,
  Museum as MuseumIcon,
  Thermostat as ClimateCrateIcon,
  CropPortrait as TFrameIcon,
  CheckBox as PrePackedIcon
} from '@mui/icons-material';
import { AppConfigService } from '../lib/supabase/app-config';
import { organizationStandardsService } from '../lib/standards';
import { AppliedStandards } from '../lib/standards/types';
import useSupabaseStore from '../store/useSupabaseStore';
import useCurrency from '../hooks/useCurrency';

interface DeliverySpecificsDetails {
  deliveryRequirements: Set<string>;
  packingRequirements: string;
  accessAtDelivery: Set<string>;
  safetySecurityRequirements: Set<string>;
  conditionCheckRequirements: Set<string>;
}

interface DeliverySpecificsProps {
  transportMode?: string;
  transportType?: string;
  totalArtworkValue?: number;
  isFragile?: boolean;
  organizationName?: string;
  organizationId?: string;
}

// Icon mapping for different options
const getOptionIcon = (option: string, category: 'delivery' | 'access' | 'security' | 'condition' | 'packing') => {
  const iconProps = { sx: { fontSize: '20px', color: '#666' } };
  
  switch (category) {
    case 'delivery':
      if (option.includes('Ground Floor')) return <DeliveryIcon {...iconProps} />;
      if (option.includes('Unpacking')) return <PackageIcon {...iconProps} />;
      if (option.includes('Condition')) return <InspectIcon {...iconProps} />;
      if (option.includes('Installation')) return <InstallIcon {...iconProps} />;
      if (option.includes('Debris')) return <CleanIcon {...iconProps} />;
      if (option.includes('White Glove')) return <PremiumIcon {...iconProps} />;
      break;
    
    case 'access':
      if (option.includes('Ground Floor')) return <BuildingIcon {...iconProps} />;
      if (option.includes('Elevator')) return <ElevatorIcon {...iconProps} />;
      if (option.includes('Stairs')) return <StairsIcon {...iconProps} />;
      if (option.includes('Equipment')) return <EngineeringIcon {...iconProps} />;
      if (option.includes('Rigging')) return <CraneIcon {...iconProps} />;
      if (option.includes('Survey')) return <InspectIcon {...iconProps} />;
      break;
    
    case 'security':
      if (option.includes('Climate')) return <ClimateIcon {...iconProps} />;
      if (option.includes('Two-Person')) return <TeamIcon {...iconProps} />;
      if (option.includes('Air-Ride')) return <VehicleIcon {...iconProps} />;
      if (option.includes('GPS')) return <GpsIcon {...iconProps} />;
      if (option.includes('Escort')) return <SecurityIcon {...iconProps} />;
      if (option.includes('Signature')) return <SignatureIcon {...iconProps} />;
      if (option.includes('Fixed')) return <LocationIcon {...iconProps} />;
      if (option.includes('Redirection')) return <BlockIcon {...iconProps} />;
      if (option.includes('Airport')) return <AirportIcon {...iconProps} />;
      break;
    
    case 'condition':
      if (option.includes('Pre-Collection')) return <InspectionIcon {...iconProps} />;
      if (option.includes('Basic')) return <NotesIcon {...iconProps} />;
      if (option.includes('Photo Documentation')) return <PhotoIcon {...iconProps} />;
      if (option.includes('Photo Set')) return <PhotoSetIcon {...iconProps} />;
      if (option.includes('Professional')) return <ReportIcon {...iconProps} />;
      if (option.includes('Commentary')) return <CommentIcon {...iconProps} />;
      break;
    
    case 'packing':
      if (option.includes('Existing')) return <ExistingCrateIcon {...iconProps} />;
      if (option.includes('Soft Wrap')) return <WrapIcon {...iconProps} />;
      if (option.includes('Standard Crate')) return <StandardCrateIcon {...iconProps} />;
      if (option.includes('Double-Wall')) return <DoubleCrateIcon {...iconProps} />;
      if (option.includes('Museum')) return <MuseumIcon {...iconProps} />;
      if (option.includes('Climate-Controlled')) return <ClimateCrateIcon {...iconProps} />;
      if (option.includes('T-Frame')) return <TFrameIcon {...iconProps} />;
      if (option.includes('Pre-Packed')) return <PrePackedIcon {...iconProps} />;
      break;
  }
  
  return <InspectionIcon {...iconProps} />; // Default icon
};

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const createMenuProps = (width: number) => ({
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width
    }
  }
});

const defaultMenuProps = createMenuProps(320);
const mediumMenuProps = createMenuProps(360);
const wideMenuProps = createMenuProps(420);

const UNKNOWN_OPTION = "I don't know";

const ensureUnknownOption = (options: string[]): string[] => {
  if (!options.includes(UNKNOWN_OPTION)) {
    return [...options, UNKNOWN_OPTION];
  }
  return options;
};

const getMenuItemStyles = (option: string, selected: readonly string[], theme: Theme) => ({
  fontWeight: selected.includes(option)
    ? theme.typography.fontWeightMedium
    : theme.typography.fontWeightRegular
});

// Default details for the component
const defaultDetails: DeliverySpecificsDetails = {
  deliveryRequirements: new Set<string>(),
  packingRequirements: '',
  accessAtDelivery: new Set<string>(),
  safetySecurityRequirements: new Set<string>(),
  conditionCheckRequirements: new Set<string>()
};

const DeliverySpecifics: React.FC<DeliverySpecificsProps> = ({
  transportMode,
  transportType,
  totalArtworkValue = 0,
  organizationName,
  organizationId
}) => {
  // Get state and actions from Zustand store
  const {
    forms: { shipment },
    updateDeliveryRequirements,
    updatePackingRequirements,
    updateAccessRequirements,
    updateSafetySecurityRequirements,
    updateConditionCheckRequirements
  } = useSupabaseStore();
  const { formatCurrency } = useCurrency();

  // Local state for available options (not selected values)
  const [deliveryRequirementsOptions, setDeliveryRequirementsOptions] = useState<string[]>([]);
  const [packingRequirementsOptions, setPackingRequirementsOptions] = useState<string[]>([]);
  const [accessAtDeliveryOptions, setAccessAtDeliveryOptions] = useState<string[]>([]);
  const [safetySecurityOptions, setSafetySecurityOptions] = useState<string[]>([]);
  const [conditionCheckOptions, setConditionCheckOptions] = useState<string[]>([]);
  const [appliedStandards, setAppliedStandards] = useState<AppliedStandards | null>(null);
  const theme = useTheme();
  const deliverySelectLabelId = 'delivery-requirements-select-label';
  const deliverySelectId = 'delivery-requirements-select';
  const deliverySelectPlaceholder = 'Select delivery services';
  const packingSelectLabelId = 'packing-requirements-select-label';
  const packingSelectId = 'packing-requirements-select';
  const packingSelectPlaceholder = 'Select packing method';
  const accessSelectLabelId = 'access-at-delivery-select-label';
  const accessSelectId = 'access-at-delivery-select';
  const accessSelectPlaceholder = 'Select delivery access details';
  const safetySelectLabelId = 'safety-security-select-label';
  const safetySelectId = 'safety-security-select';
  const safetySelectPlaceholder = 'Select safety & security measures';
  const conditionSelectLabelId = 'condition-check-select-label';
  const conditionSelectId = 'condition-check-select';
  const conditionSelectPlaceholder = 'Select condition reporting requirements';

  const normalizeSelection = (value: unknown): string[] => {
    if (value instanceof Set) {
      return Array.from(value);
    }

    if (Array.isArray(value)) {
      return (value as unknown[])
        .map(item => (typeof item === 'string' ? item : String(item)))
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    }

    return [];
  };

  const selectedDeliveryRequirements = useMemo<string[]>(() => {
    return normalizeSelection(shipment.deliveryRequirements);
  }, [shipment.deliveryRequirements]);

  const selectedAccessAtDelivery = useMemo<string[]>(() => {
    return normalizeSelection(shipment.accessAtDelivery);
  }, [shipment.accessAtDelivery]);

  const selectedSafetySecurity = useMemo<string[]>(() => {
    return normalizeSelection(shipment.safetySecurityRequirements);
  }, [shipment.safetySecurityRequirements]);

  const selectedConditionCheck = useMemo<string[]>(() => {
    return normalizeSelection(shipment.conditionCheckRequirements);
  }, [shipment.conditionCheckRequirements]);

  const selectedPackingRequirement = shipment.packingRequirements || '';

  // Load options from Supabase on component mount
  useEffect(() => {
    const loadOptions = async () => {
      console.log('🔧 DeliverySpecifics: Starting to load options from database...');
      
      // Fallback options that match the database structure
      const fallbackOptions = {
        delivery: ensureUnknownOption([
          "Ground Floor/Curbside Delivery",
          "Dock-to-Dock Delivery", 
          "Unpacking Service",
          "Installation Service",
          "Condition Checking",
          "Debris Removal",
          "White Glove Service"
        ]),
        packing: ensureUnknownOption([
          "Existing Crate (Reuse)",
          "Soft Wrap/Blanket Wrap",
          "Standard Crate", 
          "Double-Wall Crate",
          "Museum-Quality Crate",
          "Climate-Controlled Crate",
          "T-Frame (Paintings)",
          "Pre-Packed (No Service Needed)"
        ]),
        access: ensureUnknownOption([
          "Ground Floor - Unrestricted Access",
          "Freight Elevator Available", 
          "Stairs Only",
          "Special Equipment Required",
          "Loading Dock Available"
        ]),
        safety: ensureUnknownOption([
          "Climate-Controlled Container",
          "Two-Person Delivery Team",
          "Air-Ride Suspension Vehicle", 
          "GPS Tracking",
          "Security Escort Vehicle",
          "Signature on Delivery",
          "Fixed Delivery Address",
          "No Redirection Allowed",
          "Airport Security Supervision"
        ]),
        condition: ensureUnknownOption([
          "Basic Condition Notes",
          "Pre-Collection Inspection",
          "Photo Documentation (2+ photos)",
          "Comprehensive Photo Set (3+ photos)",
          "Professional Condition Report", 
          "Detailed Report with Commentary"
        ])
      };
      
      try {
        const [delivery, packing, access, safety, condition] = await Promise.all([
          AppConfigService.getDeliveryRequirements(),
          AppConfigService.getPackingRequirements(),
          AppConfigService.getAccessRequirements(),
          AppConfigService.getSafetySecurityRequirements(),
          AppConfigService.getConditionCheckRequirements()
        ]);
        
        console.log('🔧 Raw database responses:', {
          delivery,
          packing,
          access,
          safety,
          condition
        });
        
        // Check if we got empty results and try to setup missing configs
        const hasEmptyResults = !delivery?.options?.length || !packing?.options?.length || 
                               !access?.options?.length || !safety?.options?.length || 
                               !condition?.options?.length;
        
        let finalDelivery = delivery;
        let finalPacking = packing;
        let finalAccess = access;
        let finalSafety = safety;
        let finalCondition = condition;
        
        if (hasEmptyResults) {
          console.log('🔧 Detected missing/empty configs, attempting to verify and setup...');
          const configsExist = await AppConfigService.verifyConfigs();
          
          if (!configsExist) {
            console.log('🔧 Setting up missing app configurations...');
            const setupSuccess = await AppConfigService.setupDefaultConfigs();
            
            if (setupSuccess) {
              // Retry fetching after setup
              console.log('🔧 Retrying data fetch after setup...');
              const [retryDelivery, retryPacking, retryAccess, retrySafety, retryCondition] = await Promise.all([
                AppConfigService.getDeliveryRequirements(),
                AppConfigService.getPackingRequirements(), 
                AppConfigService.getAccessRequirements(),
                AppConfigService.getSafetySecurityRequirements(),
                AppConfigService.getConditionCheckRequirements()
              ]);
              
              console.log('🔧 Retry results:', {
                retryDelivery,
                retryPacking,
                retryAccess,
                retrySafety,
                retryCondition
              });
              
              // Use retry results if they have data
              finalDelivery = retryDelivery || delivery;
              finalPacking = retryPacking || packing;
              finalAccess = retryAccess || access;
              finalSafety = retrySafety || safety;
              finalCondition = retryCondition || condition;
            }
          }
        }
        
        const deliveryOptionsSource = finalDelivery?.options?.length ? finalDelivery.options : fallbackOptions.delivery;
        const packingOptionsSource = finalPacking?.options?.length ? finalPacking.options : fallbackOptions.packing;
        const accessOptionsSource = finalAccess?.options?.length ? finalAccess.options : fallbackOptions.access;
        const safetyOptionsSource = finalSafety?.options?.length ? finalSafety.options : fallbackOptions.safety;
        const conditionOptionsSource = finalCondition?.options?.length ? finalCondition.options : fallbackOptions.condition;

        const deliveryOptions = ensureUnknownOption(deliveryOptionsSource);
        const packingOptions = ensureUnknownOption(packingOptionsSource);
        const accessOptions = ensureUnknownOption(accessOptionsSource);
        const safetyOptions = ensureUnknownOption(safetyOptionsSource);
        const conditionOptions = ensureUnknownOption(conditionOptionsSource);
        
        console.log('🔧 Processed options (with fallbacks if needed):', {
          deliveryCount: deliveryOptions.length,
          packingCount: packingOptions.length,
          accessCount: accessOptions.length,
          safetyCount: safetyOptions.length,
          conditionCount: conditionOptions.length,
          usingFallbacks: {
            delivery: !delivery?.options?.length,
            packing: !packing?.options?.length,
            access: !access?.options?.length,
            safety: !safety?.options?.length,
            condition: !condition?.options?.length
          }
        });
        
        setDeliveryRequirementsOptions(deliveryOptions);
        setPackingRequirementsOptions(packingOptions);
        setAccessAtDeliveryOptions(accessOptions);
        setSafetySecurityOptions(safetyOptions);
        setConditionCheckOptions(conditionOptions);
      } catch (error) {
        console.error('🚨 Error loading options from database, using fallbacks:', error);
        // Use fallback options if database fails
        setDeliveryRequirementsOptions(fallbackOptions.delivery);
        setPackingRequirementsOptions(fallbackOptions.packing);
        setAccessAtDeliveryOptions(fallbackOptions.access);
        setSafetySecurityOptions(fallbackOptions.safety);
        setConditionCheckOptions(fallbackOptions.condition);
      }
    };
    
    loadOptions();
  }, []);

  // Debug details state changes
  useEffect(() => {
    console.log('🔍 Details state change debug:', {
      safetySecurityRequirements: {
        type: typeof shipment.safetySecurityRequirements,
        isSet: shipment.safetySecurityRequirements instanceof Set,
        size: shipment.safetySecurityRequirements?.size,
        values: shipment.safetySecurityRequirements ? Array.from(shipment.safetySecurityRequirements) : 'undefined'
      },
      conditionCheckRequirements: {
        type: typeof shipment.conditionCheckRequirements,
        isSet: shipment.conditionCheckRequirements instanceof Set,
        size: shipment.conditionCheckRequirements?.size,
        values: shipment.conditionCheckRequirements ? Array.from(shipment.conditionCheckRequirements) : 'undefined'
      },
      deliveryRequirements: {
        type: typeof shipment.deliveryRequirements,
        isSet: shipment.deliveryRequirements instanceof Set,
        size: shipment.deliveryRequirements?.size,
        values: shipment.deliveryRequirements ? Array.from(shipment.deliveryRequirements) : 'undefined'
      }
    });
  }, [shipment.safetySecurityRequirements, shipment.conditionCheckRequirements, shipment.deliveryRequirements]);

  // Auto-apply organization standards when transport mode, type, or value changes
  useEffect(() => {
    console.log('🔍 DeliverySpecifics: Checking standards for:', { 
      organizationName, 
      organizationId, 
      transportMode, 
      transportType, 
      totalArtworkValue,
      optionsLoaded: {
        delivery: shipment.deliveryRequirements.size,
        safety: shipment.safetySecurityRequirements.size,
        condition: shipment.conditionCheckRequirements.size,
        packing: shipment.packingRequirements
      }
    });
    
    if (!organizationStandardsService.hasStandardsForOrganization(organizationName, organizationId)) {
      console.log('❌ No standards found for organization');
      // updateDeliveryRequirements(new Set()); // This will be handled by Zustand
      // updatePackingRequirements(''); // This will be handled by Zustand
      // updateAccessRequirements(new Set()); // This will be handled by Zustand
      // updateSafetySecurityRequirements(new Set()); // This will be handled by Zustand
      // updateConditionCheckRequirements(new Set()); // This will be handled by Zustand
      return;
    }
    
    const standards = organizationStandardsService.getAppliedStandards(
      organizationName,
      organizationId,
      transportMode,
      transportType,
      totalArtworkValue
    );
    
    if (standards) {
      console.log('✅ Standards to apply:', standards);
      // updateDeliveryRequirements(new Set(standards.deliveryRequirements)); // This will be handled by Zustand
      // updatePackingRequirements(standards.packingRequirements); // This will be handled by Zustand
      // updateAccessRequirements(new Set(standards.accessAtDelivery)); // This will be handled by Zustand
      // updateSafetySecurityRequirements(new Set(standards.safetySecurityRequirements)); // This will be handled by Zustand
      // updateConditionCheckRequirements(new Set(standards.conditionCheckRequirements)); // This will be handled by Zustand
      
      // Auto-select delivery requirements
      if (standards.deliveryRequirements && deliveryRequirementsOptions.length > 0) {
        const newDeliveryReqs = new Set<string>();
        standards.deliveryRequirements.forEach((req: string) => {
          if (deliveryRequirementsOptions.includes(req)) {
            console.log(`📋 Auto-selecting delivery requirement: ${req}`);
            newDeliveryReqs.add(req);
          } else {
            console.log(`⚠️ Delivery requirement not found in options: ${req}`, deliveryRequirementsOptions);
          }
        });
        if (newDeliveryReqs.size > 0) {
          updateDeliveryRequirements(newDeliveryReqs);
        }
      }
      
      // Auto-select safety/security requirements
      if (standards.safetySecurityRequirements && safetySecurityOptions.length > 0) {
        const newSafetyReqs = new Set<string>();
        standards.safetySecurityRequirements.forEach((req: string) => {
          if (safetySecurityOptions.includes(req)) {
            console.log(`🔒 Auto-selecting safety requirement: ${req}`);
            newSafetyReqs.add(req);
          } else {
            console.log(`⚠️ Safety requirement not found in options: ${req}`, safetySecurityOptions);
          }
        });
        if (newSafetyReqs.size > 0) {
          updateSafetySecurityRequirements(newSafetyReqs);
        }
      }
      
      // Auto-select condition check requirements
      if (standards.conditionCheckRequirements && conditionCheckOptions.length > 0) {
        const newConditionReqs = new Set<string>();
        standards.conditionCheckRequirements.forEach((req: string) => {
          if (conditionCheckOptions.includes(req)) {
            console.log(`📊 Auto-selecting condition check requirement: ${req}`);
            newConditionReqs.add(req);
          } else {
            console.log(`⚠️ Condition check requirement not found in options: ${req}`, conditionCheckOptions);
          }
        });
        if (newConditionReqs.size > 0) {
          updateConditionCheckRequirements(newConditionReqs);
        }
      }
      
      // Auto-set packing requirements
      if (standards.packingRequirements) {
        console.log(`📦 Auto-selecting packing requirement: ${standards.packingRequirements}`);
        if (packingRequirementsOptions.includes(standards.packingRequirements)) {
          updatePackingRequirements(standards.packingRequirements);
        } else {
          console.log(`⚠️ Packing requirement not found in options: ${standards.packingRequirements}`, packingRequirementsOptions);
        }
      }
    } else {
      console.log('❌ No applicable standards found');
      // updateDeliveryRequirements(new Set()); // This will be handled by Zustand
      // updatePackingRequirements(''); // This will be handled by Zustand
      // updateAccessRequirements(new Set()); // This will be handled by Zustand
      // updateSafetySecurityRequirements(new Set()); // This will be handled by Zustand
      // updateConditionCheckRequirements(new Set()); // This will be handled by Zustand
    }
  }, [
    organizationName, 
    organizationId, 
    transportMode, 
    transportType, 
    totalArtworkValue,
    // Removed shipment state values to prevent infinite loop
    // Standards should only re-apply when organization/transport details change, not when shipment state changes
    deliveryRequirementsOptions,
    safetySecurityOptions,
    conditionCheckOptions,
    packingRequirementsOptions
    // Note: updateDeliveryRequirements, updatePackingRequirements, updateAccessRequirements, updateSafetySecurityRequirements, updateConditionCheckRequirements intentionally excluded to prevent infinite loops
    // since they are recreated on every parent render
  ]);
 
  const handleDeliveryRequirementsChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value }
    } = event;
    const normalizedValue = typeof value === 'string' ? value.split(',') : value;
    console.log('🚚 Updating delivery requirements via dropdown:', normalizedValue);
    updateDeliveryRequirements(new Set(normalizedValue));
  };

  const handleAccessSelectChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value }
    } = event;
    const normalizedValue = typeof value === 'string' ? value.split(',') : value;
    updateAccessRequirements(new Set(normalizedValue));
  };

  const handleSafetySecuritySelectChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value }
    } = event;
    const normalizedValue = typeof value === 'string' ? value.split(',') : value;
    updateSafetySecurityRequirements(new Set(normalizedValue));
  };

  const handleConditionCheckSelectChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value }
    } = event;
    const normalizedValue = typeof value === 'string' ? value.split(',') : value;
    updateConditionCheckRequirements(new Set(normalizedValue));
  };

  const handlePackingRequirementChange = (event: SelectChangeEvent<string>) => {
    const {
      target: { value }
    } = event;
    updatePackingRequirements(value);
  };

  const handleDeliveryRequirementToggle = (requirement: string) => {
      console.log(`🚚 Toggling delivery requirement: ${requirement}`);
      const newSet = new Set(shipment.deliveryRequirements);
      if (newSet.has(requirement)) {
          console.log(`➖ Removing: ${requirement}`);
          newSet.delete(requirement);
      } else {
          console.log(`➕ Adding: ${requirement}`);
          newSet.add(requirement);
      }
      console.log(`📋 New delivery set:`, Array.from(newSet));
      updateDeliveryRequirements(newSet);
  };

  const handleAccessToggle = (access: string) => {
      const newSet = new Set(shipment.accessAtDelivery);
      if (newSet.has(access)) {
          newSet.delete(access);
      } else {
          newSet.add(access);
      }
      updateAccessRequirements(newSet);
  };

  const handleSafetySecurityToggle = (requirement: string) => {
      console.log(`🔒 Toggling safety requirement: ${requirement}`);
      const newSet = new Set(shipment.safetySecurityRequirements || new Set());
      if (newSet.has(requirement)) {
          console.log(`➖ Removing safety: ${requirement}`);
          newSet.delete(requirement);
      } else {
          console.log(`➕ Adding safety: ${requirement}`);
          newSet.add(requirement);
      }
      console.log(`🔒 New safety set:`, Array.from(newSet));
      updateSafetySecurityRequirements(newSet);
  };

  const handleConditionCheckToggle = (requirement: string) => {
      console.log(`📊 Toggling condition check requirement: ${requirement}`);
      const newSet = new Set(shipment.conditionCheckRequirements || new Set());
      if (newSet.has(requirement)) {
          console.log(`➖ Removing condition: ${requirement}`);
          newSet.delete(requirement);
      } else {
          console.log(`➕ Adding condition: ${requirement}`);
          newSet.add(requirement);
      }
      console.log(`📊 New condition set:`, Array.from(newSet));
      updateConditionCheckRequirements(newSet);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        fontSize: '24px',
        fontWeight: '700',
        color: '#170849',
        margin: '0 0 8px 0'
      }}>
        <DeliveryIcon sx={{ fontSize: '28px', color: '#8412ff' }} />
        Delivery Specifics
      </h2>
      
      {/* DEBUG INFO - Remove this in production */}
      {/* <div style={{
        padding: '12px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        border: '1px solid #ddd'
      }}>
        <strong>🐛 DEBUG INFO:</strong><br/>
        Org: {organizationName} (ID: {organizationId})<br/>
        Transport: {transportMode} - {transportType}<br/>
        Value: ${formatCurrency(totalArtworkValue)}<br/>
        Selected: Delivery({shipment.deliveryRequirements.size}), Safety({shipment.safetySecurityRequirements.size}), Condition({shipment.conditionCheckRequirements.size})<br/>
        Standards Applied: {organizationStandardsService.hasStandardsForOrganization(organizationName, organizationId) ? 'YES' : 'NO'}
      </div> */}
      {organizationStandardsService.hasStandardsForOrganization(organizationName, organizationId) && (
        <div style={{
          backgroundColor: '#f0f8ff',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '10px',
          fontSize: '14px',
          border: '1px solid #e3f2fd'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>ℹ️</span>
            <div>
              <div style={{ fontWeight: 'bold', color: '#1976d2', marginBottom: '4px' }}>
                {organizationStandardsService.getStandardsDisplayName(organizationName, organizationId)} Standards Applied
              </div>
              <div style={{ color: '#424242', fontSize: '13px' }}>
                {organizationStandardsService.getNotificationMessage(
                  organizationName,
                  organizationId,
                  transportMode,
                  transportType,
                  totalArtworkValue,
                  formatCurrency(totalArtworkValue)
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
              <label style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'rgba(23, 8, 73, 0.8)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <DeliveryIcon sx={{ fontSize: '20px', color: '#8412ff' }} />
                Delivery Requirements
              </label>
              <p style={{ 
                fontSize: '14px', 
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '12px'
              }}>
                Select the delivery services required.
              </p>
              <FormControl fullWidth sx={{ maxWidth: 560 }}>
                <InputLabel id={deliverySelectLabelId} shrink>
                  {deliverySelectPlaceholder}
                </InputLabel>
                <Select
                  labelId={deliverySelectLabelId}
                  id={deliverySelectId}
                  multiple
                  displayEmpty
                  value={selectedDeliveryRequirements}
                  onChange={handleDeliveryRequirementsChange}
                  input={<OutlinedInput label={deliverySelectPlaceholder} />}
                  renderValue={selected => {
                    const values = selected as string[];

                    if (!values.length) {
                      return (
                        <span style={{ color: theme.palette.text.disabled }}>
                          {deliverySelectPlaceholder}
                        </span>
                      );
                    }

                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {values.map(value => (
                          <Chip
                            key={value}
                            label={value}
                            onDelete={() => handleDeliveryRequirementToggle(value)}
                            onMouseDown={event => event.stopPropagation()}
                            sx={{ maxWidth: '100%' }}
                          />
                        ))}
                      </Box>
                    );
                  }}
                  MenuProps={defaultMenuProps}
                >
                  {deliveryRequirementsOptions.map(option => (
                    <MenuItem
                      key={option}
                      value={option}
                      sx={{
                        ...getMenuItemStyles(option, selectedDeliveryRequirements, theme)
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getOptionIcon(option, 'delivery')}
                        <span>{option}</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
          </div>

          <div>
              <label style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'rgba(23, 8, 73, 0.8)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <PackageIcon sx={{ fontSize: '20px', color: '#8412ff' }} />
                Packing Requirements
              </label>
              <p style={{ 
                fontSize: '14px', 
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '12px'
              }}>
                Please select the most appropriate packing method for your estimate.
              </p>
              <FormControl fullWidth sx={{ maxWidth: 560 }}>
                <InputLabel id={packingSelectLabelId} shrink>
                  {packingSelectPlaceholder}
                </InputLabel>
                <Select
                  labelId={packingSelectLabelId}
                  id={packingSelectId}
                  displayEmpty
                  value={selectedPackingRequirement}
                  onChange={handlePackingRequirementChange}
                  input={<OutlinedInput label={packingSelectPlaceholder} />}
                  renderValue={selected => {
                    const value = selected as string;

                    if (!value) {
                      return (
                        <span style={{ color: theme.palette.text.disabled }}>
                          {packingSelectPlaceholder}
                        </span>
                      );
                    }

                    return (
                      <Chip
                        label={value}
                        onDelete={() => updatePackingRequirements('')}
                        onMouseDown={event => event.stopPropagation()}
                        sx={{ maxWidth: '100%' }}
                      />
                    );
                  }}
                  MenuProps={defaultMenuProps}
                >
                  {packingRequirementsOptions.map(option => (
                    <MenuItem
                      key={option}
                      value={option}
                      sx={{
                        ...getMenuItemStyles(option, selectedPackingRequirement ? [selectedPackingRequirement] : [], theme)
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getOptionIcon(option, 'packing')}
                        <span>{option}</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
          </div>

          <div>
              <label style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'rgba(23, 8, 73, 0.8)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <BuildingIcon sx={{ fontSize: '20px', color: '#8412ff' }} />
                Access at Delivery
              </label>
              <p style={{ 
                fontSize: '14px', 
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '12px'
              }}>
                Please select all that apply regarding access at the delivery location.
              </p>
              <FormControl fullWidth sx={{ maxWidth: 600 }}>
                <InputLabel id={accessSelectLabelId} shrink>
                  {accessSelectPlaceholder}
                </InputLabel>
                <Select
                  labelId={accessSelectLabelId}
                  id={accessSelectId}
                  multiple
                  displayEmpty
                  value={selectedAccessAtDelivery}
                  onChange={handleAccessSelectChange}
                  input={<OutlinedInput label={accessSelectPlaceholder} />}
                  renderValue={selected => {
                    const values = selected as string[];

                    if (!values.length) {
                      return (
                        <span style={{ color: theme.palette.text.disabled }}>
                          {accessSelectPlaceholder}
                        </span>
                      );
                    }

                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {values.map(value => (
                          <Chip
                            key={value}
                            label={value}
                            onDelete={() => handleAccessToggle(value)}
                            onMouseDown={event => event.stopPropagation()}
                            sx={{ maxWidth: '100%' }}
                          />
                        ))}
                      </Box>
                    );
                  }}
                  MenuProps={mediumMenuProps}
                >
                  {accessAtDeliveryOptions.map(access => (
                    <MenuItem
                      key={access}
                      value={access}
                      sx={{
                        ...getMenuItemStyles(access, selectedAccessAtDelivery, theme)
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getOptionIcon(access, 'access')}
                        <span>{access}</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
          </div>

          <div>
              <label style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'rgba(23, 8, 73, 0.8)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <SecurityIcon sx={{ fontSize: '20px', color: '#8412ff' }} />
                Safety & Security Requirements
              </label>
              <p style={{ 
                fontSize: '14px', 
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '12px'
              }}>
                Select the safety and security measures required for your estimate.
              </p>
              <FormControl fullWidth sx={{ maxWidth: 680 }}>
                <InputLabel id={safetySelectLabelId} shrink>
                  {safetySelectPlaceholder}
                </InputLabel>
                <Select
                  labelId={safetySelectLabelId}
                  id={safetySelectId}
                  multiple
                  displayEmpty
                  value={selectedSafetySecurity}
                  onChange={handleSafetySecuritySelectChange}
                  input={<OutlinedInput label={safetySelectPlaceholder} />}
                  renderValue={selected => {
                    const values = selected as string[];

                    if (!values.length) {
                      return (
                        <span style={{ color: theme.palette.text.disabled }}>
                          {safetySelectPlaceholder}
                        </span>
                      );
                    }

                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {values.map(value => (
                          <Chip
                            key={value}
                            label={value}
                            onDelete={() => handleSafetySecurityToggle(value)}
                            onMouseDown={event => event.stopPropagation()}
                            sx={{ maxWidth: '100%' }}
                          />
                        ))}
                      </Box>
                    );
                  }}
                  MenuProps={wideMenuProps}
                >
                  {safetySecurityOptions.map(requirement => (
                    <MenuItem
                      key={requirement}
                      value={requirement}
                      sx={{
                        ...getMenuItemStyles(requirement, selectedSafetySecurity, theme)
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getOptionIcon(requirement, 'security')}
                        <span>{requirement}</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
          </div>

          <div>
              <label style={{ 
                fontSize: '16px', 
                fontWeight: '600', 
                color: 'rgba(23, 8, 73, 0.8)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <InspectionIcon sx={{ fontSize: '20px', color: '#8412ff' }} />
                Condition Check Requirements
              </label>
              <p style={{ 
                fontSize: '14px', 
                color: 'rgba(23, 8, 73, 0.7)',
                marginBottom: '12px'
              }}>
                Select the condition reporting requirements for your estimate.
              </p>
              <FormControl fullWidth sx={{ maxWidth: 720 }}>
                <InputLabel id={conditionSelectLabelId} shrink>
                  {conditionSelectPlaceholder}
                </InputLabel>
                <Select
                  labelId={conditionSelectLabelId}
                  id={conditionSelectId}
                  multiple
                  displayEmpty
                  value={selectedConditionCheck}
                  onChange={handleConditionCheckSelectChange}
                  input={<OutlinedInput label={conditionSelectPlaceholder} />}
                  renderValue={selected => {
                    const values = selected as string[];

                    if (!values.length) {
                      return (
                        <span style={{ color: theme.palette.text.disabled }}>
                          {conditionSelectPlaceholder}
                        </span>
                      );
                    }

                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {values.map(value => (
                          <Chip
                            key={value}
                            label={value}
                            onDelete={() => handleConditionCheckToggle(value)}
                            onMouseDown={event => event.stopPropagation()}
                            sx={{ maxWidth: '100%' }}
                          />
                        ))}
                      </Box>
                    );
                  }}
                  MenuProps={wideMenuProps}
                >
                  {conditionCheckOptions.map(requirement => (
                    <MenuItem
                      key={requirement}
                      value={requirement}
                      sx={{
                        ...getMenuItemStyles(requirement, selectedConditionCheck, theme)
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getOptionIcon(requirement, 'condition')}
                        <span>{requirement}</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
          </div>
      </div>
    </div>
  );
};

export default DeliverySpecifics; 
