import * as React from "react";

import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";

import { useShipmentForm } from "../hooks/useShipmentForm";
import useSupabaseStore from "../store/useSupabaseStore";
import useCurrency from "../hooks/useCurrency";
import { organizationStandardsService } from "../lib/standards";

type RequirementsStepProps = {
  onBack: () => void;
  onNext?: () => void;
};

const TOKENS = {
  primary: "#8412FF",
  secondary: "#00AAAB",
  text: "#181D27",
};

const fonts = "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif";

const muiTheme = createTheme({
  palette: {
    primary: { main: TOKENS.primary },
    secondary: { main: TOKENS.secondary },
    text: { primary: TOKENS.text },
  },
  typography: {
    fontFamily: fonts,
  },
});

const DELIVERY_OPTIONS = [
  "Ground Floor/Curbside Delivery",
  "Dock-to-Dock Delivery",
  "Unpacking Service",
  "Installation Service",
  "Condition Checking",
  "Debris Removal",
  "White Glove Service",
  "I don't know",
] as const;

const PACKING_OPTIONS = [
  "Existing Crate (Reuse)",
  "Soft Wrap/Blanket Wrap",
  "Standard Crate",
  "Double-Wall Crate",
  "Museum-Quality Crate",
  "Climate-Controlled Crate",
  "T-Frame (Paintings)",
  "Pre-Packed (No Service Needed)",
  "I don't know",
] as const;

const ACCESS_OPTIONS = [
  "Ground Floor - Unrestricted Access",
  "Freight Elevator Available",
  "Stairs Only",
  "Special Equipment Required",
  "Loading Dock Available",
  "I don't know",
] as const;

const SAFETY_OPTIONS = [
  "Climate-Controlled Container",
  "Two-Person Delivery Team",
  "Air-Ride Suspension Vehicle",
  "GPS Tracking",
  "Security Escort Vehicle",
  "Signature on Delivery",
  "Fixed Delivery Address",
  "No Redirection Allowed",
  "Airport Security Supervision",
  "I don't know",
] as const;

const CONDITION_OPTIONS = [
  "Basic Condition Notes",
  "Pre-Collection Inspection",
  "Photo Documentation (2+ photos)",
  "Comprehensive Photo Set (3+ photos)",
  "Professional Condition Report",
  "Detailed Report with Commentary",
  "I don't know",
] as const;

const IDK_OPTION = "I don't know";

const DELIVERY_PLACEHOLDER = "Select delivery services";
const PACKING_PLACEHOLDER = "Select packing method";
const ACCESS_PLACEHOLDER = "Select delivery access details";
const SAFETY_PLACEHOLDER = "Select safety requirements";
const CONDITION_PLACEHOLDER = "Select condition check requirements";

function exclusiveIDK(values: string[]): string[] {
  return values.includes(IDK_OPTION) ? [IDK_OPTION] : values.filter((value) => value !== IDK_OPTION);
}

function renderMultiSelectValue(
  selected: string[],
  placeholder: string,
  onDelete: (value: string) => void
) {
  if (selected.length === 0) {
    return <span style={{ color: "rgba(23, 8, 73, 0.45)" }}>{placeholder}</span>;
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {selected.map((value) => (
        <Chip
          key={value}
          label={value}
          size="small"
          onDelete={() => onDelete(value)}
          onMouseDown={(event) => event.stopPropagation()}
          sx={{ maxWidth: "100%" }}
        />
      ))}
    </Box>
  );
}

function renderSingleSelectValue(
  selected: string,
  placeholder: string,
  onClear: () => void
) {
  if (!selected) {
    return <span style={{ color: "rgba(23, 8, 73, 0.45)" }}>{placeholder}</span>;
  }

  return (
    <Chip
      label={selected}
      size="small"
      onDelete={onClear}
      onMouseDown={(event) => event.stopPropagation()}
      sx={{ maxWidth: "100%" }}
    />
  );
}

function normalizeTransportMode(mode?: string | null): string | null {
  if (!mode) return null;
  if (mode === "Road") {
    return "Ground";
  }
  return mode;
}

function filterStandards(values: Iterable<string> | undefined, options: readonly string[]): string[] {
  if (!values) return [];
  const allowed = new Set(options);
  const unique = new Set<string>();
  for (const value of values) {
    if (allowed.has(value)) {
      unique.add(value);
    }
  }
  return exclusiveIDK(Array.from(unique));
}

function hasSetChanged(current: Set<string> | undefined, next: string[]): boolean {
  if (!current) {
    return next.length > 0;
  }
  if (current.size !== next.length) {
    return true;
  }
  return next.some((value) => !current.has(value));
}

function createMenuProps(width: number) {
  return {
    PaperProps: {
      style: {
        maxHeight: 44 * 5.5,
        width,
      },
    },
  };
}

const MENU_PROPS = createMenuProps(360);

export default function RequirementsStep({ onBack, onNext }: RequirementsStepProps) {
  const { shipmentForm, updateShipmentForm } = useShipmentForm();
  const currentOrg = useSupabaseStore((state) => state.currentOrg);
  const { formatCurrency } = useCurrency();

  const organizationId = currentOrg?.id ?? undefined;
  const organizationName = currentOrg?.name ?? undefined;

  const deliverySelection = React.useMemo(
    () => Array.from(shipmentForm.deliveryRequirements ?? new Set<string>()),
    [shipmentForm.deliveryRequirements]
  );
  const packingSelection = shipmentForm.packingRequirements ?? "";
  const accessSelection = React.useMemo(
    () => Array.from(shipmentForm.accessAtDelivery ?? new Set<string>()),
    [shipmentForm.accessAtDelivery]
  );
  const safetySelection = React.useMemo(
    () => Array.from(shipmentForm.safetySecurityRequirements ?? new Set<string>()),
    [shipmentForm.safetySecurityRequirements]
  );
  const conditionSelection = React.useMemo(
    () => Array.from(shipmentForm.conditionCheckRequirements ?? new Set<string>()),
    [shipmentForm.conditionCheckRequirements]
  );

  const totalArtworkValue = React.useMemo(
    () => (shipmentForm.artworks ?? []).reduce((sum, artwork) => sum + (Number(artwork.value) || 0), 0),
    [shipmentForm.artworks]
  );

  const hasFragileArtwork = React.useMemo(
    () => (shipmentForm.artworks ?? []).some((artwork) => Boolean(artwork.isFragile)),
    [shipmentForm.artworks]
  );

  const normalizedTransportMode = React.useMemo(
    () => normalizeTransportMode(shipmentForm.transportMode),
    [shipmentForm.transportMode]
  );

  const transportType = shipmentForm.transportType ?? undefined;

  const appliedStandardsSignatureRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!normalizedTransportMode) {
      return;
    }

    const signature = [
      organizationId || organizationName || "unknown",
      normalizedTransportMode,
      totalArtworkValue.toFixed(2),
      hasFragileArtwork ? "1" : "0",
    ].join("|");

    if (appliedStandardsSignatureRef.current === signature) {
      return;
    }

    appliedStandardsSignatureRef.current = signature;

    const standards = organizationStandardsService.getAppliedStandards(
      organizationName,
      organizationId,
      normalizedTransportMode,
      undefined,
      totalArtworkValue,
      hasFragileArtwork
    );

    if (!standards) {
      return;
    }

    const nextDelivery = filterStandards(standards.deliveryRequirements, DELIVERY_OPTIONS);
    const nextSafety = filterStandards(standards.safetySecurityRequirements, SAFETY_OPTIONS);
    const nextCondition = filterStandards(standards.conditionCheckRequirements, CONDITION_OPTIONS);

    const updates: Record<string, unknown> = {};

    if (hasSetChanged(shipmentForm.deliveryRequirements, nextDelivery)) {
      updates.deliveryRequirements = new Set(nextDelivery);
    }

    if (hasSetChanged(shipmentForm.safetySecurityRequirements, nextSafety)) {
      updates.safetySecurityRequirements = new Set(nextSafety);
    }

    if (hasSetChanged(shipmentForm.conditionCheckRequirements, nextCondition)) {
      updates.conditionCheckRequirements = new Set(nextCondition);
    }

    const packing = standards.packingRequirements;
    if (
      typeof packing === "string" &&
      PACKING_OPTIONS.includes(packing as (typeof PACKING_OPTIONS)[number]) &&
      packing !== shipmentForm.packingRequirements
    ) {
      updates.packingRequirements = packing;
    }

    if (Object.keys(updates).length > 0) {
      updateShipmentForm(updates);
    }
  }, [
    organizationId,
    organizationName,
    normalizedTransportMode,
    totalArtworkValue,
    hasFragileArtwork,
    shipmentForm.deliveryRequirements,
    shipmentForm.safetySecurityRequirements,
    shipmentForm.conditionCheckRequirements,
    shipmentForm.packingRequirements,
    updateShipmentForm,
  ]);

  const handleDeliveryChange = React.useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const value = event.target.value;
      const next = typeof value === "string" ? value.split(",") : (value as string[]);
      const normalized = exclusiveIDK(next);
      updateShipmentForm({ deliveryRequirements: new Set(normalized) });
    },
    [updateShipmentForm]
  );

  const handlePackingChange = React.useCallback(
    (event: SelectChangeEvent<string>) => {
      const value = event.target.value;
      updateShipmentForm({ packingRequirements: value });
    },
    [updateShipmentForm]
  );

  const handleAccessChange = React.useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const value = event.target.value;
      const next = typeof value === "string" ? value.split(",") : (value as string[]);
      updateShipmentForm({ accessAtDelivery: new Set(next) });
    },
    [updateShipmentForm]
  );

  const handleSafetyChange = React.useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const value = event.target.value;
      const next = typeof value === "string" ? value.split(",") : (value as string[]);
      const normalized = exclusiveIDK(next);
      updateShipmentForm({ safetySecurityRequirements: new Set(normalized) });
    },
    [updateShipmentForm]
  );

  const handleConditionChange = React.useCallback(
    (event: SelectChangeEvent<string[]>) => {
      const value = event.target.value;
      const next = typeof value === "string" ? value.split(",") : (value as string[]);
      const normalized = exclusiveIDK(next);
      updateShipmentForm({ conditionCheckRequirements: new Set(normalized) });
    },
    [updateShipmentForm]
  );

  const deliveryIdkSelected = deliverySelection.includes(IDK_OPTION);
  const accessIdkSelected = accessSelection.includes(IDK_OPTION);
  const safetyIdkSelected = safetySelection.includes(IDK_OPTION);
  const conditionIdkSelected = conditionSelection.includes(IDK_OPTION);

  const hasOrganizationStandards = React.useMemo(
    () => organizationStandardsService.hasStandardsForOrganization(organizationName, organizationId),
    [organizationName, organizationId]
  );

  const standardsDisplayName = React.useMemo(
    () =>
      hasOrganizationStandards
        ? organizationStandardsService.getStandardsDisplayName(organizationName, organizationId)
        : null,
    [hasOrganizationStandards, organizationName, organizationId]
  );

  const formattedTotalValue = React.useMemo(
    () => formatCurrency(totalArtworkValue),
    [formatCurrency, totalArtworkValue]
  );

  const standardsNotice = React.useMemo(
    () =>
      hasOrganizationStandards && normalizedTransportMode
        ? organizationStandardsService.getNotificationMessage(
            organizationName,
            organizationId,
            normalizedTransportMode,
            transportType,
            totalArtworkValue,
            formattedTotalValue
          )
        : null,
    [
      hasOrganizationStandards,
      normalizedTransportMode,
      organizationName,
      organizationId,
      transportType,
      totalArtworkValue,
      formattedTotalValue,
    ]
  );

  const showStandardsNotice = Boolean(hasOrganizationStandards && normalizedTransportMode && standardsNotice);

  return (
    <ThemeProvider theme={muiTheme}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 32, width: 1256 }}>
        <div className="right">
          <div className="right-container">
            <div className="frame2315">
              <div className="frameHeader">
                <div className="informationTitle">Requirements</div>
                <Typography
                  variant="body2"
                  sx={{
                    color: "rgba(23, 8, 73, 0.7)",
                    marginTop: 1,
                    fontSize: 14,
                    lineHeight: "20px",
                  }}
                >
                  To help ensure your estimate is as accurate as possible, please select all requirements that
                  apply. If you are unsure, select 'I don't know' and our expert shippers will provide guidance
                  based on the artwork details.
                </Typography>
              </div>

              {showStandardsNotice && (
                <Box
                  sx={{
                    width: "100%",
                    backgroundColor: "#f0f8ff",
                    border: "1px solid #e3f2fd",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    color: "#424242",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <Box component="span" sx={{ fontSize: 16, lineHeight: "20px" }}>
                      ℹ️
                    </Box>
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, color: "#1976d2", marginBottom: "4px" }}
                      >
                        {`${standardsDisplayName ?? "Organization"} Standards Applied`}
                      </Typography>
                      <Typography variant="body2" sx={{ color: "#424242", whiteSpace: "pre-line" }}>
                        {standardsNotice}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}

              <div className="frameRow">
                <div className="panel">
                  <Typography variant="h6" className="panelTitle" sx={{ mb: 0.5 }}>
                    Delivery &amp; Packing
                  </Typography>

                  <FormControl fullWidth>
                    <InputLabel id="delivery-req-label" shrink>
                      Delivery Requirements
                    </InputLabel>
                    <Select
                      labelId="delivery-req-label"
                      multiple
                      value={deliverySelection}
                      onChange={handleDeliveryChange}
                      displayEmpty
                      input={<OutlinedInput label="Delivery Requirements" />}
                      renderValue={(selected) =>
                        renderMultiSelectValue(selected as string[], DELIVERY_PLACEHOLDER, (value) => {
                          const filtered = (selected as string[]).filter((item) => item !== value);
                          const normalized = exclusiveIDK(filtered);
                          updateShipmentForm({ deliveryRequirements: new Set(normalized) });
                        })
                      }
                      MenuProps={MENU_PROPS}
                    >
                      {DELIVERY_OPTIONS.map((name) => (
                        <MenuItem
                          key={name}
                          value={name}
                          disabled={name !== IDK_OPTION && deliveryIdkSelected}
                        >
                          <ListItemText primary={name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel id="packing-req-label" shrink>
                      Packing Requirements
                    </InputLabel>
                    <Select
                      labelId="packing-req-label"
                      value={packingSelection}
                      onChange={handlePackingChange}
                      displayEmpty
                      input={<OutlinedInput label="Packing Requirements" />}
                      renderValue={(selected) =>
                        renderSingleSelectValue(selected as string, PACKING_PLACEHOLDER, () =>
                          updateShipmentForm({ packingRequirements: "" })
                        )
                      }
                      MenuProps={MENU_PROPS}
                    >
                      {PACKING_OPTIONS.map((name) => (
                        <MenuItem key={name} value={name}>
                          {name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel id="access-label" shrink>
                      Access at Delivery
                    </InputLabel>
                    <Select
                      labelId="access-label"
                      multiple
                      value={accessSelection}
                      onChange={handleAccessChange}
                      displayEmpty
                      input={<OutlinedInput label="Access at Delivery" />}
                      renderValue={(selected) =>
                        renderMultiSelectValue(selected as string[], ACCESS_PLACEHOLDER, (value) => {
                          const filtered = (selected as string[]).filter((item) => item !== value);
                          updateShipmentForm({ accessAtDelivery: new Set(filtered) });
                        })
                      }
                      MenuProps={MENU_PROPS}
                    >
                      {ACCESS_OPTIONS.map((name) => (
                        <MenuItem
                          key={name}
                          value={name}
                          disabled={name !== IDK_OPTION && accessIdkSelected}
                        >
                          <ListItemText primary={name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </div>

                <div className="panel">
                  <Typography variant="h6" className="panelTitle" sx={{ mb: 0.5 }}>
                    Safety &amp; Condition Checks
                  </Typography>

                  <FormControl fullWidth>
                    <InputLabel id="safety-label" shrink>
                      Safety &amp; Security Requirements
                    </InputLabel>
                    <Select
                      labelId="safety-label"
                      multiple
                      value={safetySelection}
                      onChange={handleSafetyChange}
                      displayEmpty
                      input={<OutlinedInput label="Safety & Security Requirements" />}
                      renderValue={(selected) =>
                        renderMultiSelectValue(selected as string[], SAFETY_PLACEHOLDER, (value) => {
                          const filtered = (selected as string[]).filter((item) => item !== value);
                          const normalized = exclusiveIDK(filtered);
                          updateShipmentForm({ safetySecurityRequirements: new Set(normalized) });
                        })
                      }
                      MenuProps={MENU_PROPS}
                    >
                      {SAFETY_OPTIONS.map((name) => (
                        <MenuItem
                          key={name}
                          value={name}
                          disabled={name !== IDK_OPTION && safetyIdkSelected}
                        >
                          <ListItemText primary={name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel id="condition-label" shrink>
                      Condition Check Requirements
                    </InputLabel>
                    <Select
                      labelId="condition-label"
                      multiple
                      value={conditionSelection}
                      onChange={handleConditionChange}
                      displayEmpty
                      input={<OutlinedInput label="Condition Check Requirements" />}
                      renderValue={(selected) =>
                        renderMultiSelectValue(selected as string[], CONDITION_PLACEHOLDER, (value) => {
                          const filtered = (selected as string[]).filter((item) => item !== value);
                          const normalized = exclusiveIDK(filtered);
                          updateShipmentForm({ conditionCheckRequirements: new Set(normalized) });
                        })
                      }
                      MenuProps={MENU_PROPS}
                    >
                      {CONDITION_OPTIONS.map((name) => (
                        <MenuItem
                          key={name}
                          value={name}
                          disabled={name !== IDK_OPTION && conditionIdkSelected}
                        >
                          <ListItemText primary={name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </div>
              </div>
            </div>

            <div className="requirements-footer">
              <Button
                variant="text"
                onClick={onBack}
                startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16, color: "#A4A7AE" }} />}
                sx={{
                  color: "#170849",
                  textTransform: "none",
                  fontFamily: fonts,
                  fontWeight: 500,
                  fontSize: 18,
                  lineHeight: "22px",
                  "&:hover": {
                    backgroundColor: "rgba(132, 18, 255, 0.08)",
                  },
                }}
              >
                Back
              </Button>

              <Button
                variant="contained"
                disableElevation
                onClick={() => onNext?.()}
                disabled={!onNext}
                sx={{
                  width: 240,
                  height: 44,
                  borderRadius: 2,
                  textTransform: "none",
                  fontFamily: fonts,
                  fontWeight: 500,
                  fontSize: 16,
                  lineHeight: "19px",
                  boxShadow: "none",
                  "&:hover": {
                    boxShadow: "none",
                  },
                  "&.Mui-disabled": {
                    backgroundColor: "#CBC3E3",
                    color: "#FFFFFF",
                    opacity: 1,
                  },
                }}
              >
                Next: Shippers
              </Button>
            </div>
          </div>
        </div>

        <style>{`
          .right {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            padding: 0;
            gap: 32px;
            width: 1256px;
          }
          .right-container {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            padding: 32px 40px;
            gap: 24px;
            width: 1256px;
            background: #F0FAFA;
            border-radius: 12px;
          }
          .frame2315 {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 24px;
            width: 1176px;
          }
          .frameHeader {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            width: 1176px;
          }
          .informationTitle {
            width: 1176px;
            font-family: ${fonts};
            font-weight: 500;
            font-size: 20px;
            line-height: 100%;
            letter-spacing: -0.02em;
            color: #170849;
            display: flex;
            align-items: center;
          }
          .frameRow {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            gap: 40px;
            width: 1176px;
          }
          .panel {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 20px;
            width: 568px;
            background: #FFFFFF;
            border-radius: 10px;
            padding: 20px 24px 24px;
            box-sizing: border-box;
          }
          .panelTitle {
            font-family: ${fonts};
            font-weight: 500;
            font-size: 16px;
            letter-spacing: -0.02em;
            color: #170849;
          }
          .requirements-footer {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            gap: 24px;
            width: 1176px;
            margin-top: 8px;
          }
        `}</style>
      </div>
    </ThemeProvider>
  );
}
