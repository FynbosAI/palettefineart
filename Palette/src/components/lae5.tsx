import * as React from "react";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Typography,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import FlightIcon from "@mui/icons-material/Flight";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { useNavigate } from "react-router-dom";

import { TOKENS, mapRecordToShipper, describeBranchRecord } from "./lae4";
import { useShipmentForm } from "../hooks/useShipmentForm";
import useSupabaseStore from "../store/useSupabaseStore";
import useCurrency from "../hooks/useCurrency";
import {
  LogisticsPartnerService,
  LocationService,
  supabase,
} from "../lib/supabase";
import type { SelectedShipperContext, Shipper } from "../types";
import { API_BASE_URL } from "../config";
import {
  createArtworkImageUpload,
  confirmArtworkImageUpload,
  getArtworkImageViewUrl,
} from "../../../shared/api/artworkImagesClient";

const fonts = "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif";

type TransportModeKey = "Air" | "Sea" | "Road" | "Courier";

const TRANSPORT_ICON_MAP: Record<TransportModeKey, React.ElementType> = {
  Air: FlightIcon,
  Sea: DirectionsBoatIcon,
  Road: LocalShippingIcon,
  Courier: Inventory2OutlinedIcon,
};

function ensureSet(value?: Set<string> | null): Set<string> {
  return value instanceof Set ? value : new Set<string>();
}

function ensureMap<K, V>(value?: Map<K, V> | null): Map<K, V> {
  return value instanceof Map ? value : new Map<K, V>();
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "TBD";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "TBD";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography
        sx={{
          fontFamily: fonts,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "rgba(23, 8, 73, 0.7)",
          marginBottom: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontFamily: fonts,
          fontSize: 14,
          fontWeight: 600,
          color: "#170849",
          wordBreak: "break-word",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function RequirementGroup({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null;
  }

  return (
    <Box>
      <Typography
        sx={{
          fontFamily: fonts,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "rgba(23, 8, 73, 0.7)",
          marginBottom: 0.5,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {values.map((value) => (
          <Chip
            key={value}
            label={value}
            variant="outlined"
            sx={{
              borderRadius: "999px",
              fontFamily: fonts,
              fontSize: 12,
              fontWeight: 500,
              color: TOKENS.primary,
              borderColor: TOKENS.primary,
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

type SummaryStepProps = {
  onBack: () => void;
};

export default function SummaryStep({ onBack }: SummaryStepProps) {
  const navigate = useNavigate();
  const {
    shipmentForm,
    geminiArtworkData,
    updateGeminiArtworkImageUrl,
    clearGeminiArtworkBlobs,
  } = useShipmentForm();
  const supabaseStore = useSupabaseStore();
  const { formatCurrency } = useCurrency();

  const selectedShipperSet = ensureSet(shipmentForm.selectedShippers);
  const selectedContexts = ensureMap<string, SelectedShipperContext>(
    shipmentForm.selectedShipperContexts
  );

  const selectedShipperIds = React.useMemo(
    () => Array.from(selectedShipperSet),
    [selectedShipperSet]
  );

  const transportModeRaw =
    (shipmentForm.transportMode === "Rail" ? "Road" : shipmentForm.transportMode) ?? "Air";
  const transportModeKey = transportModeRaw as TransportModeKey;
  const TransportIcon =
    TRANSPORT_ICON_MAP[transportModeKey] ?? FlightIcon;

  const artworks = shipmentForm.artworks ?? [];
  const totalArtworkValue = React.useMemo(
    () => artworks.reduce((sum, artwork) => sum + (Number(artwork.value) || 0), 0),
    [artworks]
  );

  const formattedTotalValue = formatCurrency(totalArtworkValue, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const [shipperMap, setShipperMap] = React.useState<Map<string, Shipper>>(
    () => new Map()
  );
  const [loadingShippers, setLoadingShippers] = React.useState(true);
  const [shipperLoadError, setShipperLoadError] = React.useState<string | null>(
    null
  );
  const [hiddenSelectionLabels, setHiddenSelectionLabels] = React.useState<
    string[]
  >([]);

  React.useEffect(() => {
    let cancelled = false;

    const loadShippers = async () => {
      setLoadingShippers(true);
      try {
        const result = await LogisticsPartnerService.getLogisticsPartners();
        if (cancelled) {
          return;
        }

        const mapped = (result.data ?? []).map(mapRecordToShipper);
        const lookup = new Map<string, Shipper>();
        mapped.forEach((shipper) => {
          lookup.set(shipper.branchOrgId, shipper);
        });
        setShipperMap(lookup);

        if (result.error) {
          console.error("LogisticsPartnerService error (summary):", result.error);
          setShipperLoadError(
            "We couldn’t load your shippers. Some selections may show limited details."
          );
        } else {
          setShipperLoadError(null);
        }

        const branchIdSet = new Set(mapped.map((shipper) => shipper.branchOrgId));
        const hidden = selectedShipperIds.filter((id) => !branchIdSet.has(id));
        if (hidden.length > 0) {
          const filteredOutRecords = result.meta?.filteredOutBranches ?? [];
          const labels = hidden
            .map((id) => {
              const record = filteredOutRecords.find(
                (entry) => entry.branch.id === id
              );
              if (record) {
                return describeBranchRecord(record);
              }
              const context = selectedContexts.get(id);
              if (context) {
                return context.branchOrgId;
              }
              return id;
            })
            .filter((label): label is string => Boolean(label));

          setHiddenSelectionLabels(Array.from(new Set(labels)));
        } else {
          setHiddenSelectionLabels([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading shippers for summary:", error);
          setShipperLoadError(
            "We couldn’t load your shippers. Some selections may show limited details."
          );
          setShipperMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setLoadingShippers(false);
        }
      }
    };

    loadShippers();

    return () => {
      cancelled = true;
    };
  }, [selectedContexts, selectedShipperIds]);

  const selectedInviteTargets = React.useMemo(
    () =>
      selectedShipperIds
        .map((id) => selectedContexts.get(id))
        .filter((context): context is SelectedShipperContext => Boolean(context)),
    [selectedContexts, selectedShipperIds]
  );

  const selectedShippersDisplay = React.useMemo(() => {
    if (selectedShipperIds.length === 0) {
      return [] as { id: string; label: string }[];
    }

    return selectedShipperIds
      .map((id) => {
        const shipper = shipperMap.get(id);
        const context = selectedContexts.get(id);
        const fallback = context?.branchOrgId ?? id;
        const label = shipper
          ? shipper.displayName ||
            (shipper.companyName && shipper.branchName
              ? `${shipper.companyName} — ${shipper.branchName}`
              : shipper.companyName || fallback)
          : fallback;
        return { id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedContexts, selectedShipperIds, shipperMap]);

  const requirementGroups = React.useMemo(
    () => ({
      delivery: Array.from(ensureSet(shipmentForm.deliveryRequirements)),
      access: Array.from(ensureSet(shipmentForm.accessAtDelivery)),
      safety: Array.from(ensureSet(shipmentForm.safetySecurityRequirements)),
      condition: Array.from(ensureSet(shipmentForm.conditionCheckRequirements)),
      packing: shipmentForm.packingRequirements
        ? [shipmentForm.packingRequirements]
        : [],
    }),
    [
      shipmentForm.accessAtDelivery,
      shipmentForm.conditionCheckRequirements,
      shipmentForm.deliveryRequirements,
      shipmentForm.packingRequirements,
      shipmentForm.safetySecurityRequirements,
    ]
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const uploadArtworkImages = React.useCallback(
    async (quoteId: string, artworkIds: string[]) => {
      if (!geminiArtworkData || geminiArtworkData.length === 0) {
        return;
      }

      const sessionResponse = await supabase.auth.getSession();
      const accessToken = sessionResponse.data.session?.access_token;

      if (!accessToken) {
        console.warn(
          "[SUMMARY] Unable to upload artwork images: missing Supabase access token"
        );
        return;
      }

      const uploadPromises = geminiArtworkData.map(async (artwork, index) => {
        const artworkImageBlob = (artwork as any).imageBlob as
          | Blob
          | undefined;
        const artworkStoragePath = (artwork as any).imageStoragePath as
          | string
          | undefined;
        const artworkPreviewUrl = (artwork as any).imagePreviewUrl as
          | string
          | undefined;

        if (!artworkImageBlob || artworkStoragePath) {
          return null;
        }

        try {
          const artworkId = artworkIds[index];
          if (!artworkId) {
            return null;
          }

          const contentType = artworkImageBlob.type || "image/png";
          const fileExtension = (() => {
            if (contentType.includes("png")) return "png";
            if (contentType.includes("jpeg") || contentType.includes("jpg"))
              return "jpg";
            if (contentType.includes("webp")) return "webp";
            if (contentType.includes("gif")) return "gif";
            return "bin";
          })();

          const originalFilename = `${artworkId}_${Date.now()}.${fileExtension}`;

          const createResult = await createArtworkImageUpload({
            quoteId,
            artworkId,
            originalFilename,
            contentType,
            accessToken,
            baseUrl: API_BASE_URL,
          });

          const { error: uploadError } = await supabase.storage
            .from(createResult.bucket)
            .uploadToSignedUrl(createResult.path, createResult.token, artworkImageBlob, {
              contentType,
              upsert: false,
              cacheControl: "3600",
            } as any);

          if (uploadError) {
            console.error(
              `[SUMMARY] Failed to upload image for artwork ${artworkId}:`,
              uploadError
            );
            throw uploadError;
          }

          const confirmResult = await confirmArtworkImageUpload({
            quoteId,
            artworkId,
            path: createResult.path,
            originalFilename,
            accessToken,
            baseUrl: API_BASE_URL,
          });

          let previewUrl: string | null = null;
          let previewExpiresAt: number | null = null;

          try {
            const viewResult = await getArtworkImageViewUrl({
              artworkId,
              accessToken,
              baseUrl: API_BASE_URL,
            });
            previewUrl = viewResult.url;
            previewExpiresAt = Date.now() + 55_000;
          } catch (viewErr) {
            console.warn(
              `[SUMMARY] Unable to fetch signed preview URL for artwork ${artworkId}:`,
              viewErr
            );
          }

          updateGeminiArtworkImageUrl(artwork.id, {
            storagePath: confirmResult.path,
            storageUrl: confirmResult.path,
            previewUrl: previewUrl ?? artworkPreviewUrl ?? artwork.croppedImageUrl ?? null,
            previewExpiresAt,
          });

          return { artworkId, path: confirmResult.path };
        } catch (error) {
          console.error(`Error uploading image for artwork ${artwork.id}:`, error);
          return null;
        }
      });

      try {
        const results = await Promise.all(uploadPromises);
        const successfulUploads = results.filter(
          (result): result is { artworkId: string; path: string } =>
            Boolean(result)
        );

        if (successfulUploads.length > 0) {
          clearGeminiArtworkBlobs();
        }
      } catch (error) {
        console.error("Error during artwork image upload from summary:", error);
      }
    },
    [clearGeminiArtworkBlobs, geminiArtworkData, updateGeminiArtworkImageUrl]
  );

  const handleFinalize = React.useCallback(async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!supabaseStore.currentOrg) {
        throw new Error(
          "Your organization context is missing. Please refresh and try again."
        );
      }

      if (!shipmentForm.origin.trim() || !shipmentForm.destination.trim()) {
        throw new Error("Origin and destination are required before submitting.");
      }

      if (selectedShipperIds.length === 0) {
        throw new Error("Select at least one shipper before finalizing.");
      }

      const originLoc = await LocationService.findOrCreateLocation(
        shipmentForm.origin,
        shipmentForm.origin,
        supabaseStore.currentOrg.id
      );
      const destinationLoc = await LocationService.findOrCreateLocation(
        shipmentForm.destination,
        shipmentForm.destination,
        supabaseStore.currentOrg.id
      );

      const getValidDate = (value?: string | null): string | null => {
        if (!value || value.trim() === "") {
          return null;
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return null;
        }
        return value;
      };

      const targetDate = getValidDate(shipmentForm.arrivalDate);
      const targetDateStart =
        getValidDate(shipmentForm.targetDateStart) ?? targetDate;
      const targetDateEnd = getValidDate(shipmentForm.targetDateEnd) ?? targetDate;

      const invitedShipperNames = selectedInviteTargets.map((context) => {
        const shipper =
          shipperMap.get(context.branchOrgId) ||
          shipperMap.get(context.logisticsPartnerId);
        if (!shipper) {
          return context.branchOrgId;
        }
        if (shipper.displayName) {
          return shipper.displayName;
        }
        if (shipper.companyName && shipper.branchName) {
          return `${shipper.companyName} — ${shipper.branchName}`;
        }
        return shipper.companyName ?? context.branchOrgId;
      });

      const normalizedTransportMethod =
        shipmentForm.transportMode === "Rail"
          ? "Road"
          : shipmentForm.transportMode ?? null;

      const requirements = {
        transport_method: normalizedTransportMethod,
        transport_type: shipmentForm.transportType ?? null,
        invited_shippers: invitedShipperNames,
      } as const;

      const deliverySpecifics = {
        delivery_requirements: Array.from(
          ensureSet(shipmentForm.deliveryRequirements)
        ),
        packing_requirements: shipmentForm.packingRequirements ?? "",
        access_requirements: Array.from(
          ensureSet(shipmentForm.accessAtDelivery)
        ),
        safety_security_requirements: Array.from(
          ensureSet(shipmentForm.safetySecurityRequirements)
        ),
        condition_check_requirements: Array.from(
          ensureSet(shipmentForm.conditionCheckRequirements)
        ),
      } as const;

      const payload = {
        title:
          shipmentForm.title ||
          (artworks[0]?.title || artworks[0]?.description || "New Shipment"),
        type: "requested" as const,
        status: "active" as const,
        route: `${shipmentForm.origin} → ${shipmentForm.destination}`,
        origin_id: originLoc.id,
        destination_id: destinationLoc.id,
        target_date: targetDate,
        target_date_start: targetDateStart,
        target_date_end: targetDateEnd,
        value: totalArtworkValue || null,
        notes: shipmentForm.notes || null,
        requirements,
        delivery_specifics: deliverySpecifics,
        owner_org_id: supabaseStore.currentOrg.id,
        client_reference: shipmentForm.clientReference || null,
        origin_contact_name: shipmentForm.originContactName || null,
        origin_contact_phone: shipmentForm.originContactPhone || null,
        origin_contact_email: shipmentForm.originContactEmail || null,
        destination_contact_name: shipmentForm.destinationContactName || null,
        destination_contact_phone: shipmentForm.destinationContactPhone || null,
        destination_contact_email: shipmentForm.destinationContactEmail || null,
        bidding_deadline: shipmentForm.autoCloseBidding
          ? shipmentForm.biddingDeadline
          : null,
        auto_close_bidding: shipmentForm.autoCloseBidding,
      } as const;

      const quoteArtworks = artworks.map((artwork) => ({
        name: artwork.title || artwork.description || "Untitled",
        artist_name: artwork.artist,
        year_completed: artwork.year,
        medium: artwork.medium,
        dimensions: artwork.dimensions,
        weight: (() => {
          const numericWeight = typeof artwork.weightValue === 'number' && Number.isFinite(artwork.weightValue)
            ? artwork.weightValue
            : null;
          if (artwork.weight && artwork.weight.toString().trim().length > 0) {
            return artwork.weight.toString();
          }
          if (numericWeight !== null) {
            return `${numericWeight}${artwork.weightUnit ? ` ${artwork.weightUnit}` : ''}`.trim();
          }
          return null;
        })(),
        weight_value: typeof artwork.weightValue === 'number' && Number.isFinite(artwork.weightValue)
          ? artwork.weightValue
          : null,
        weight_unit: artwork.weightUnit || null,
        volumetric_weight_value: typeof artwork.volumetricWeightValue === 'number' && Number.isFinite(artwork.volumetricWeightValue)
          ? artwork.volumetricWeightValue
          : null,
        volumetric_weight_unit: artwork.volumetricWeightUnit || null,
        has_existing_crate: typeof artwork.hasExistingCrate === 'boolean' ? artwork.hasExistingCrate : null,
        category: artwork.category || null,
        item_type: artwork.itemType || null,
        period: artwork.period || null,
        declared_value: artwork.value,
        crating: null,
        description: artwork.description,
        image_url: null,
        tariff_code: null,
        country_of_origin: artwork.countryOfOrigin,
        export_license_required: false,
        special_requirements: artwork.isFragile ? { fragile: true } : null,
      }));

      const { data, error } = await supabaseStore.createQuoteWithArtworks(
        payload as any,
        quoteArtworks
      );

      if (error) {
        throw error;
      }

      const savedQuoteId = data?.id;
      if (!savedQuoteId) {
        throw new Error("Quote creation succeeded but no identifier was returned.");
      }

      if (data?.quote_artworks && geminiArtworkData?.length) {
        const artworkIds = data.quote_artworks.map((entry: any) => entry.id);
        await uploadArtworkImages(savedQuoteId, artworkIds);
      }

      if (selectedInviteTargets.length > 0) {
        const { error: inviteError } = await supabaseStore.createQuoteInvites(
          savedQuoteId,
          selectedInviteTargets
        );

        if (inviteError) {
          console.error("Error creating quote invites:", inviteError);
        }
      }

      await supabaseStore.fetchQuotes();

      navigate("/logistics");
    } catch (error) {
      console.error("Error submitting shipment from summary:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while submitting the shipment."
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    artworks,
    geminiArtworkData,
    navigate,
    selectedInviteTargets,
    selectedShipperIds,
    shipmentForm,
    shipperMap,
    submitting,
    supabaseStore,
    totalArtworkValue,
    uploadArtworkImages,
  ]);

  const finalizeDisabled = submitting || selectedShipperIds.length === 0;

  const hasRequirements =
    requirementGroups.delivery.length > 0 ||
    requirementGroups.access.length > 0 ||
    requirementGroups.safety.length > 0 ||
    requirementGroups.condition.length > 0 ||
    requirementGroups.packing.length > 0;

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: fonts,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1256,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          paddingBottom: 4,
        }}
      >
        {submitError ? (
          <Alert severity="error" sx={{ fontFamily: fonts }}>
            {submitError}
          </Alert>
        ) : null}

        {shipperLoadError ? (
          <Alert severity="warning" sx={{ fontFamily: fonts }}>
            {shipperLoadError}
          </Alert>
        ) : null}

        {hiddenSelectionLabels.length > 0 ? (
          <Alert severity="warning" sx={{ fontFamily: fonts }}>
            We kept your previous selections even though they’re filtered out:
            {" "}
            {hiddenSelectionLabels.join(", ")}
          </Alert>
        ) : null}

        <Box
          sx={{
            backgroundColor: "#F0FAFA",
            borderRadius: 2,
            padding: { xs: 2.5, md: 3 },
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignItems: { xs: "flex-start", md: "center" },
              gap: 2,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontWeight: 500,
                  fontSize: 32,
                  lineHeight: "110%",
                  letterSpacing: "-0.02em",
                  color: "#170849",
                }}
              >
                {shipmentForm.title?.trim() || "Order summary"}
              </Typography>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(23, 8, 73, 0.7)",
                  marginTop: 1,
                }}
              >
                Client reference:{" "}
                <span style={{ color: "#170849" }}>
                  {shipmentForm.clientReference?.trim() || "—"}
                </span>
              </Typography>
            </Box>
            <Chip
              label="Ready to submit"
              sx={{
                alignSelf: { xs: "flex-start", md: "center" },
                borderRadius: "999px",
                border: "1.5px solid #0DAB71",
                fontFamily: fonts,
                fontSize: 12,
                fontWeight: 600,
                color: "#0DAB71",
                backgroundColor: "#FFFFFF",
              }}
            />
          </Box>

          <Box
            sx={{
              backgroundColor: "#FFFFFF",
              borderRadius: 2,
              padding: { xs: 2.5, md: 3 },
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                width: "100%",
              }}
            >
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.secondary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#FFFFFF",
                  }}
                />
              </Box>
              <Box
                sx={{
                  flex: 1,
                  height: 3,
                  backgroundColor: TOKENS.secondary,
                  borderRadius: 3,
                }}
              />
              <TransportIcon
                sx={{
                  fontSize: 24,
                  color: "#170849",
                }}
              />
              <Box
                sx={{
                  flex: 1,
                  borderTop: "2px dashed rgba(0, 170, 171, 0.35)",
                  height: 0,
                }}
              />
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  backgroundColor: "#FFFFFF",
                  border: "2px solid rgba(0, 170, 171, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LocationOnOutlinedIcon
                  sx={{
                    fontSize: 18,
                    color: "#170849",
                  }}
                />
              </Box>
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 3,
              }}
            >
              <SummaryStat
                label="Origin"
                value={shipmentForm.origin?.trim() || "Not specified"}
              />
              <SummaryStat
                label="Destination"
                value={shipmentForm.destination?.trim() || "Not specified"}
              />
            </Box>

            <Divider sx={{ borderColor: "#E1E5EA" }} />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(4, minmax(0, 1fr))",
                },
                gap: 3,
              }}
            >
              <SummaryStat
                label="Transport mode"
                value={shipmentForm.transportMode || "Not specified"}
              />
              <SummaryStat
                label="Arrival date"
                value={formatDate(shipmentForm.arrivalDate)}
              />
              <SummaryStat label="Artworks" value={artworks.length || "0"} />
              <SummaryStat
                label="Total value"
                value={formattedTotalValue || "$0.00"}
              />
            </Box>

            <Divider sx={{ borderColor: "#E1E5EA" }} />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  color: "rgba(23, 8, 73, 0.7)",
                }}
              >
                Selected shippers
              </Typography>
              {loadingShippers ? (
                <Typography
                  sx={{
                    fontFamily: fonts,
                    fontSize: 14,
                    color: "rgba(23, 8, 73, 0.7)",
                  }}
                >
                  Loading shippers…
                </Typography>
              ) : selectedShippersDisplay.length > 0 ? (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {selectedShippersDisplay.map((shipper) => (
                    <Chip
                      key={shipper.id}
                      label={shipper.label}
                      variant="outlined"
                      sx={{
                        borderRadius: "999px",
                        fontFamily: fonts,
                        fontSize: 12,
                        fontWeight: 500,
                        color: TOKENS.primary,
                        borderColor: TOKENS.primary,
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography
                  sx={{
                    fontFamily: fonts,
                    fontSize: 14,
                    color: "rgba(23, 8, 73, 0.7)",
                  }}
                >
                  No shippers selected.
                </Typography>
              )}
            </Box>

            <Divider sx={{ borderColor: "#E1E5EA" }} />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  color: "rgba(23, 8, 73, 0.7)",
                }}
              >
                Requirements & services
              </Typography>
              {hasRequirements ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <RequirementGroup
                    label="Delivery requirements"
                    values={requirementGroups.delivery}
                  />
                  <RequirementGroup
                    label="Access at delivery"
                    values={requirementGroups.access}
                  />
                  <RequirementGroup
                    label="Safety & security"
                    values={requirementGroups.safety}
                  />
                  <RequirementGroup
                    label="Condition checks"
                    values={requirementGroups.condition}
                  />
                  <RequirementGroup
                    label="Packing"
                    values={requirementGroups.packing}
                  />
                </Box>
              ) : (
                <Typography
                  sx={{
                    fontFamily: fonts,
                    fontSize: 14,
                    color: "rgba(23, 8, 73, 0.7)",
                  }}
                >
                  No additional requirements specified.
                </Typography>
              )}
            </Box>

            <Divider sx={{ borderColor: "#E1E5EA" }} />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  color: "rgba(23, 8, 73, 0.7)",
                }}
              >
                Estimate Deadline
              </Typography>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#170849",
                }}
              >
                {shipmentForm.autoCloseBidding
                  ? shipmentForm.biddingDeadline
                    ? `Auto closes ${formatDate(shipmentForm.biddingDeadline)}`
                    : "Auto close enabled"
                  : "Manual close"}
              </Typography>
            </Box>
          </Box>

          {shipmentForm.notes?.trim() ? (
            <Box
              sx={{
                backgroundColor: "#FFFFFF",
                borderRadius: 2,
                padding: { xs: 2.5, md: 3 },
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 20,
                  fontWeight: 500,
                  color: "#170849",
                }}
              >
                Notes
              </Typography>
              <Typography
                sx={{
                  fontFamily: fonts,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#170849",
                }}
              >
                {shipmentForm.notes}
              </Typography>
            </Box>
          ) : null}

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              justifyContent: "space-between",
              alignItems: { xs: "stretch", sm: "center" },
              gap: 2,
            }}
          >
            <Button
              variant="text"
              onClick={onBack}
              startIcon={
                <ArrowBackIosNewIcon sx={{ fontSize: 16, color: "#A4A7AE" }} />
              }
              sx={{
                color: "#170849",
                textTransform: "none",
                fontFamily: fonts,
                fontWeight: 500,
                fontSize: 18,
                lineHeight: "22px",
                width: { xs: "100%", sm: "auto" },
                justifyContent: { xs: "center", sm: "flex-start" },
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
              onClick={handleFinalize}
              disabled={finalizeDisabled}
              sx={{
                width: { xs: "100%", sm: 240 },
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
              {submitting ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                "Submit estimate"
              )}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
