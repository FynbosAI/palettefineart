import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Tooltip } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";

import { TOKENS } from "./lae4";
import { useShipmentForm } from "../hooks/useShipmentForm";
import type { GeminiArtwork } from "../types/legacy";
import { API_BASE_URL } from "../config";

type GoodsStepProps = {
  onBack: () => void;
  onNext: () => void;
};

type StoreArtwork = {
  id: string;
  title: string;
  artist: string;
  year: number;
  description: string;
  imageUrl: string;
  value: number;
  dimensions: string;
  medium: string;
  countryOfOrigin: string;
  currentCustomsStatus: string;
  isFragile?: boolean;
  weight?: string;
  category?: string;
  itemType?: string;
  period?: string;
  weightValue?: number;
  weightUnit?: string;
  volumetricWeightValue?: number;
  volumetricWeightUnit?: string;
  hasExistingCrate?: boolean;
};

const STEP_TOKENS = {
  ...TOKENS,
  white: "#FFFFFF",
  surface: "#F0FAFA",
  inputBg: "#F5F6F6",
  textMuted: "rgba(23, 8, 73, 0.7)",
};

const fonts = "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif";

function labelStyle(fontSize = 14): React.CSSProperties {
  return {
    fontWeight: 500,
    fontSize,
    lineHeight: "24px",
    color: STEP_TOKENS.text,
  };
}

const fieldBase: React.CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  padding: "15px 14px",
  gap: 8,
  background: STEP_TOKENS.inputBg,
  borderRadius: 10,
  border: 0,
  outline: "none",
  fontSize: 14,
  fontWeight: 500,
  color: "#5D5380",
  width: "100%",
  height: 44,
};

const accordionVariants = {
  collapsed: { height: 0, opacity: 0, overflow: "hidden" as const },
  expanded: { height: "auto", opacity: 1, overflow: "hidden" as const },
};

const WEIGHT_UNIT_OPTIONS = [
  { value: "", label: "Select unit" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "lb", label: "Pounds (lb)" },
];

export default function GoodsStep({ onBack, onNext }: GoodsStepProps) {
  const {
    shipmentForm,
    geminiArtworkData,
    updateArtworks,
    addArtwork,
    removeArtwork,
    updateArtwork,
    setDimensionUnit,
  } = useShipmentForm();

  const artworks = shipmentForm.artworks ?? [];
  const dimensionUnit = shipmentForm.dimensionUnit ?? "in";
  const dimensionPlaceholder = dimensionUnit === "cm" ? "e.g., 152 × 122 cm" : "e.g., 60 × 48 in";
  const dimensionTooltip =
    "Switch between imperial (inches) and metric (centimeters). Palette does not auto-convert existing values, so update numbers if you change units.";

  const lastGeminiSignatureRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (geminiArtworkData && geminiArtworkData.length > 0) {
      const signature = geminiArtworkData
        .map((item, index) => item.id ?? `idx-${index}`)
        .join("|");

      if (lastGeminiSignatureRef.current !== signature) {
        lastGeminiSignatureRef.current = signature;
        updateArtworks(convertGeminiToArtworks(geminiArtworkData));
      }
      return;
    }

    lastGeminiSignatureRef.current = null;

    if (artworks.length === 0) {
      updateArtworks([createEmptyArtwork()]);
    }
  }, [artworks.length, geminiArtworkData, updateArtworks]);

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [drafts, setDrafts] = React.useState<Record<string, { year: string; value: string }>>({});
  const previewUrlsRef = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      let mutated = false;

      Array.from(next).forEach((id) => {
        if (!artworks.some((artwork) => artwork.id === id)) {
          next.delete(id);
          mutated = true;
        }
      });

      return mutated ? next : previous;
    });
  }, [artworks]);

  React.useEffect(() => {
    setDrafts((previous) => {
      const next = { ...previous };
      let mutated = false;

      artworks.forEach((artwork) => {
        if (!next[artwork.id]) {
          next[artwork.id] = {
            year: artwork.year > 0 ? String(artwork.year) : "",
            value: artwork.value > 0 ? formatValue(artwork.value) : "",
          };
          mutated = true;
        }
      });

      Object.keys(next).forEach((id) => {
        if (!artworks.some((artwork) => artwork.id === id)) {
          delete next[id];
          mutated = true;
        }
      });

      return mutated ? next : previous;
    });
  }, [artworks]);

  React.useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
      previewUrlsRef.current.clear();
    },
    []
  );

  const updateDraft = React.useCallback(
    (id: string, patch: Partial<{ year: string; value: string }>) => {
      setDrafts((previous) => ({
        ...previous,
        [id]: {
          ...(previous[id] ?? { year: "", value: "" }),
          ...patch,
        },
      }));
    },
    []
  );

  const handleToggleExpanded = React.useCallback((id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleYearChange = React.useCallback(
    (id: string, input: string) => {
      updateDraft(id, { year: input });
      const numeric = parseYear(input);
      updateArtwork(id, { year: numeric });
    },
    [updateDraft, updateArtwork]
  );

  const handleValueChange = React.useCallback(
    (id: string, input: string) => {
      updateDraft(id, { value: input });
      const numeric = parseCurrency(input);
      updateArtwork(id, { value: numeric });
    },
    [updateDraft, updateArtwork]
  );

  const handleImageChange = React.useCallback(
    (id: string, file: File) => {
      const objectUrl = URL.createObjectURL(file);
      const previews = previewUrlsRef.current;
      const existing = previews.get(id);
      if (existing && existing.startsWith("blob:")) {
        URL.revokeObjectURL(existing);
      }
      previews.set(id, objectUrl);
      updateArtwork(id, { imageUrl: objectUrl });
    },
    [updateArtwork]
  );

  const handleAddArtwork = React.useCallback(() => {
    const newArtwork = createEmptyArtwork();
    addArtwork(newArtwork);
    updateDraft(newArtwork.id, { year: "", value: "" });
  }, [addArtwork, updateDraft]);

  const handleDimensionUnitToggle = React.useCallback(
    (nextUnit: "in" | "cm") => {
      if (nextUnit !== dimensionUnit) {
        setDimensionUnit(nextUnit);
      }
    },
    [dimensionUnit, setDimensionUnit]
  );

  const handleDimensionsChange = React.useCallback(
    (id: string, rawValue: string) => {
      updateArtwork(id, { dimensions: rawValue });
    },
    [updateArtwork]
  );

  const handleOptionalTextChange = React.useCallback(
    (id: string, field: "category" | "itemType" | "period", value: string) => {
      updateArtwork(id, { [field]: value } as Partial<StoreArtwork>);
    },
    [updateArtwork]
  );

  const handleNumberFieldChange = React.useCallback(
    (id: string, field: "weightValue" | "volumetricWeightValue", rawValue: string) => {
      const parsed = parseOptionalNumberInput(rawValue);
      updateArtwork(id, { [field]: parsed ?? undefined } as Partial<StoreArtwork>);
    },
    [updateArtwork]
  );

  const handleUnitChange = React.useCallback(
    (id: string, field: "weightUnit" | "volumetricWeightUnit", value: string) => {
      updateArtwork(id, { [field]: value || undefined } as Partial<StoreArtwork>);
    },
    [updateArtwork]
  );

  const handleExistingCrateToggle = React.useCallback(
    (id: string, checked: boolean) => {
      updateArtwork(id, { hasExistingCrate: checked });
    },
    [updateArtwork]
  );

  const renderUnitToggleButton = React.useCallback(
    (unit: "in" | "cm", label: string) => {
      const isActive = unit === dimensionUnit;
      return (
        <button
          type="button"
          onClick={() => handleDimensionUnitToggle(unit)}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            backgroundColor: isActive ? "#8412ff" : "#ffffff",
            color: isActive ? "#ffffff" : "#170849",
            transition: "background-color 0.2s ease-in-out",
            flex: 1,
          }}
        >
          {label}
        </button>
      );
    },
    [dimensionUnit, handleDimensionUnitToggle]
  );

  const handleRemoveArtwork = React.useCallback(
    (id: string) => {
      const artworkCount = artworks.length;
      const previews = previewUrlsRef.current;
      const existing = previews.get(id);
      if (existing && existing.startsWith("blob:")) {
        URL.revokeObjectURL(existing);
      }
      previews.delete(id);

      if (artworkCount <= 1) {
        updateArtwork(id, {
          title: "",
          artist: "",
          year: 0,
          description: "",
          imageUrl: "",
          value: 0,
          dimensions: "",
          medium: "",
          countryOfOrigin: "",
          currentCustomsStatus: "",
        });
        updateDraft(id, { year: "", value: "" });
        setExpandedIds((previous) => {
          const next = new Set(previous);
          next.add(id);
          return next;
        });
        return;
      }

      removeArtwork(id);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setExpandedIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    },
    [artworks.length, removeArtwork, updateArtwork, updateDraft]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 32, width: 1256 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "32px 40px", gap: 32, width: 1256, background: STEP_TOKENS.surface, borderRadius: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, width: 1176 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 500, fontSize: 20, lineHeight: "20px", letterSpacing: "-0.02em", color: STEP_TOKENS.text }}>
              What do you want to ship?
            </div>
            <div style={{ fontSize: 12, lineHeight: "17px", fontWeight: 500, color: STEP_TOKENS.textMuted }}>
              Please describe your item/s. If you have any questions, please send us a message.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 24, width: 1176 }}>
          <AnimatePresence initial={false}>
            {artworks.map((artwork, index) => {
              const expanded = expandedIds.has(artwork.id);
              const imageSrc = previewUrlsRef.current.get(artwork.id) ?? (artwork.imageUrl || null);
              const draft = drafts[artwork.id] ?? { year: "", value: "" };
              const resolvedTitle = artwork.title?.trim() || `Artwork ${index + 1}`;

              return (
                <motion.div
                  key={artwork.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  style={{ background: STEP_TOKENS.white, borderRadius: 10, padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <label
                        style={{ width: 56, height: 56, borderRadius: 8, border: `1px solid ${STEP_TOKENS.border}`, background: STEP_TOKENS.inputBg, display: "grid", placeItems: "center", overflow: "hidden", cursor: "pointer" }}
                        title={imageSrc ? "Change image" : "Add image"}
                      >
                        {imageSrc ? (
                          <img src={imageSrc} alt={`${resolvedTitle} image`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5D5380" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="4" width="18" height="14" rx="2" ry="2" />
                            <circle cx="8.5" cy="9.5" r="1.5" />
                            <path d="M21 16l-5.5-5.5L9 17l-2-2-4 4" />
                          </svg>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (file) {
                              handleImageChange(artwork.id, file);
                            }
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>

                      <input
                        type="text"
                        value={artwork.title || ""}
                        onChange={(event) => updateArtwork(artwork.id, { title: event.target.value })}
                        placeholder={resolvedTitle}
                        aria-label={`Artwork ${index + 1} title`}
                        style={{
                          fontWeight: 500,
                          fontSize: 20,
                          letterSpacing: "-0.02em",
                          color: STEP_TOKENS.text,
                          fontFamily: fonts,
                          border: "none",
                          background: "transparent",
                          outline: "none",
                          padding: 0,
                          minWidth: 0,
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? "Collapse item" : "Expand item"}
                        onClick={() => handleToggleExpanded(artwork.id)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${STEP_TOKENS.border}`, background: STEP_TOKENS.inputBg, display: "grid", placeItems: "center", cursor: "pointer" }}
                      >
                        <motion.svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5D5380" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" animate={{ rotate: expanded ? 180 : 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </motion.svg>
                      </button>

                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() => handleRemoveArtwork(artwork.id)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${STEP_TOKENS.border}`, background: STEP_TOKENS.inputBg, display: "grid", placeItems: "center", cursor: "pointer" }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5D5380" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="18 6 6 18" />
                          <polyline points="6 6 18 18" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        key="content"
                        initial="collapsed"
                        animate="expanded"
                        exit="collapsed"
                        variants={accordionVariants}
                        transition={{ duration: 0.25 }}
                        style={{ display: "flex", flexDirection: "column", gap: 16 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                          <div
                            style={{
                              width: 240,
                              height: 180,
                              borderRadius: 10,
                              border: `1px solid ${STEP_TOKENS.border}`,
                              background: STEP_TOKENS.white,
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 8,
                            }}
                          >
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={`${resolvedTitle} preview`}
                                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                              />
                            ) : (
                              <div style={{ color: "#5D5380", fontSize: 12, fontWeight: 500 }}>No image selected</div>
                            )}
                          </div>

                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 14px", borderRadius: 8, background: STEP_TOKENS.inputBg, border: `1px solid ${STEP_TOKENS.border}` }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5D5380" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "#5D5380" }}>{imageSrc ? "Change image" : "Add image"}</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file) {
                                  handleImageChange(artwork.id, file);
                                }
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                        </div>

                        <div style={{ display: "flex", gap: 16, width: "100%" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                            <label style={labelStyle()}>Artist</label>
                            <input type="text" value={artwork.artist || ""} onChange={(event) => updateArtwork(artwork.id, { artist: event.target.value })} style={fieldBase} placeholder="e.g., Pablo Picasso" />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 270 }}>
                            <label style={labelStyle()}>Year</label>
                            <input type="text" value={draft.year} onChange={(event) => handleYearChange(artwork.id, event.target.value)} style={fieldBase} placeholder="e.g., 1937" />
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle()}>Description</label>
                          <textarea value={artwork.description || ""} onChange={(event) => updateArtwork(artwork.id, { description: event.target.value })} style={{ ...fieldBase, height: 100, minHeight: 100, resize: "vertical", alignItems: "flex-start" }} placeholder="Enter a detailed description" />
                        </div>

                        <div style={{ display: "flex", gap: 16, width: "100%" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, maxWidth: 556 }}>
                            <label style={labelStyle()}>Value</label>
                            <div style={{ position: "relative" }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={draft.value}
                                onChange={(event) => handleValueChange(artwork.id, event.target.value)}
                                placeholder="0"
                                style={{ ...fieldBase, paddingLeft: 34 }}
                              />
                              <span style={{ position: "absolute", left: 12, top: 10, fontSize: 16, color: "#5D5380" }}>$</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <label style={labelStyle()}>Dimensions</label>
                                <Tooltip title={dimensionTooltip} arrow>
                                  <HelpOutlineIcon sx={{ fontSize: 16, color: "rgba(23, 8, 73, 0.7)" }} />
                                </Tooltip>
                              </div>
                              <div
                                style={{
                                  display: "inline-flex",
                                  borderRadius: 999,
                                  border: "1px solid #d0d0d0",
                                  overflow: "hidden",
                                  backgroundColor: "#ffffff",
                                }}
                              >
                                {renderUnitToggleButton("in", "Inches (in)")}
                                {renderUnitToggleButton("cm", "Centimeters (cm)")}
                              </div>
                            </div>
                            <div style={{ position: "relative" }}>
                              <input
                                type="text"
                                value={artwork.dimensions || ""}
                                onChange={(event) => handleDimensionsChange(artwork.id, event.target.value)}
                                style={{ ...fieldBase, paddingRight: 48 }}
                                placeholder={dimensionPlaceholder}
                              />
                              <span
                                style={{
                                  position: "absolute",
                                  right: 14,
                                  top: 12,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: "rgba(23, 8, 73, 0.7)",
                                }}
                              >
                                {dimensionUnit}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 16, width: "100%" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                            <label style={labelStyle()}>Medium</label>
                            <input type="text" value={artwork.medium || ""} onChange={(event) => updateArtwork(artwork.id, { medium: event.target.value })} style={fieldBase} placeholder="e.g., Oil on canvas" />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                            <label style={labelStyle()}>Country of origin</label>
                            <input type="text" value={artwork.countryOfOrigin || ""} onChange={(event) => updateArtwork(artwork.id, { countryOfOrigin: event.target.value })} style={fieldBase} placeholder="e.g., Spain" />
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle()}>Current customs status</label>
                          <input type="text" value={artwork.currentCustomsStatus || ""} onChange={(event) => updateArtwork(artwork.id, { currentCustomsStatus: event.target.value })} style={fieldBase} placeholder="e.g., Cleared" />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12, borderRadius: 12, background: "#F8F7FB", border: `1px dashed ${STEP_TOKENS.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: STEP_TOKENS.text }}>Optional artwork metadata</span>
                            <span style={{ fontSize: 12, color: "rgba(23, 8, 73, 0.65)" }}>Not required, but it helps partners quote faster.</span>
                          </div>

                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                              <label style={labelStyle()}>Category</label>
                              <input
                                type="text"
                                value={artwork.category || ""}
                                onChange={(event) => handleOptionalTextChange(artwork.id, "category", event.target.value)}
                                style={fieldBase}
                                placeholder="e.g., Decorative Arts"
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                              <label style={labelStyle()}>Item type</label>
                              <input
                                type="text"
                                value={artwork.itemType || ""}
                                onChange={(event) => handleOptionalTextChange(artwork.id, "itemType", event.target.value)}
                                style={fieldBase}
                                placeholder="e.g., Sculpture"
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                              <label style={labelStyle()}>Period</label>
                              <input
                                type="text"
                                value={artwork.period || ""}
                                onChange={(event) => handleOptionalTextChange(artwork.id, "period", event.target.value)}
                                style={fieldBase}
                                placeholder="e.g., Contemporary"
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                              <label style={labelStyle()}>Weight</label>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={artwork.weightValue ?? ""}
                                onChange={(event) => handleNumberFieldChange(artwork.id, "weightValue", event.target.value)}
                                style={fieldBase}
                                placeholder="e.g., 35"
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 200 }}>
                              <label style={labelStyle()}>Weight unit</label>
                              <select
                                value={artwork.weightUnit || ""}
                                onChange={(event) => handleUnitChange(artwork.id, "weightUnit", event.target.value)}
                                style={{ ...fieldBase, cursor: "pointer", appearance: "none" }}
                              >
                                {WEIGHT_UNIT_OPTIONS.map((option) => (
                                  <option key={option.value || "default"} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                              <label style={labelStyle()}>Volumetric weight</label>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={artwork.volumetricWeightValue ?? ""}
                                onChange={(event) => handleNumberFieldChange(artwork.id, "volumetricWeightValue", event.target.value)}
                                style={fieldBase}
                                placeholder="e.g., 50"
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 200 }}>
                              <label style={labelStyle()}>Volumetric unit</label>
                              <select
                                value={artwork.volumetricWeightUnit || ""}
                                onChange={(event) => handleUnitChange(artwork.id, "volumetricWeightUnit", event.target.value)}
                                style={{ ...fieldBase, cursor: "pointer", appearance: "none" }}
                              >
                                {WEIGHT_UNIT_OPTIONS.map((option) => (
                                  <option key={option.value || "vol-default"} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: "rgba(23, 8, 73, 0.8)", fontWeight: 500 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(artwork.hasExistingCrate)}
                              onChange={(event) => handleExistingCrateToggle(artwork.id, event.target.checked)}
                              style={{ width: 16, height: 16 }}
                            />
                            This artwork already has an existing crate we can reuse
                          </label>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          <button type="button" onClick={handleAddArtwork} style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, width: "100%", height: 48, background: STEP_TOKENS.primaryLight, color: "#FFFFFF", borderRadius: 10, border: "none", fontWeight: 500, fontSize: 16, fontFamily: fonts, cursor: "pointer" }}>
            <svg width="20" height="20" aria-hidden focusable="false">
              <path d="M10 4v12M4 10h12" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add another item
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, width: 1176 }}>
          <Button
            variant="text"
            onClick={onBack}
            startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16, color: "#A4A7AE" }} />}
            sx={{
              color: STEP_TOKENS.text,
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
            onClick={onNext}
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
            }}
          >
            Next: Requirements
          </Button>
        </div>
      </div>
    </div>
  );
}

function sanitize(value?: string | null): string {
  if (!value) return "";
  return value.trim();
}

function parseYear(value?: string | number | null): number {
  if (value === null || value === undefined) return 0;
  const numeric = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseCurrency(value?: string | number | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const cleaned = value.replace(/[^0-9.]/g, "");
  const numeric = Number.parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseOptionalNumberInput(value?: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatValue(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "";
  }
  return value.toString();
}

function ensureAbsoluteUrl(path: string): string {
  if (!path) return "";
  if (/^(data:|blob:|https?:)/i.test(path)) {
    return path;
  }
  if (path.startsWith("//")) {
    return `https:${path}`;
  }
  if (path.startsWith("/")) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}/${path}`;
}

function deriveImageUrl(artwork: GeminiArtwork): string {
  if (artwork.imagePreviewUrl) {
    return ensureAbsoluteUrl(artwork.imagePreviewUrl);
  }
  if (artwork.imageStorageUrl) {
    return ensureAbsoluteUrl(artwork.imageStorageUrl);
  }
  if (artwork.croppedImageUrl) {
    return ensureAbsoluteUrl(artwork.croppedImageUrl);
  }
  return "";
}

function convertGeminiToArtworks(data: GeminiArtwork[]): StoreArtwork[] {
  return data.map((artwork) => ({
    id: artwork.id ?? cryptoRandomId(),
    title: sanitize(artwork.artworkName),
    artist: sanitize(artwork.artistName),
    year: parseYear(artwork.year),
    description: sanitize(artwork.description),
    imageUrl: deriveImageUrl(artwork),
    value: parseCurrency(artwork.declaredValue),
    dimensions: sanitize(artwork.dimensions),
    medium: sanitize(artwork.medium),
    countryOfOrigin: sanitize(artwork.locationCreated),
    currentCustomsStatus: sanitize(artwork.currentCustomsStatus),
    isFragile: Boolean(
      artwork.specialRequirements?.lightSensitive ||
      artwork.specialRequirements?.temperatureSensitive ||
      artwork.specialRequirements?.humiditySensitive
    ),
    category: "",
    itemType: "",
    period: "",
    weight: "",
    weightValue: undefined,
    weightUnit: undefined,
    volumetricWeightValue: undefined,
    volumetricWeightUnit: undefined,
    hasExistingCrate: undefined,
  }));
}

function createEmptyArtwork(): StoreArtwork {
  return {
    id: cryptoRandomId(),
    title: "",
    artist: "",
    year: 0,
    description: "",
    imageUrl: "",
    value: 0,
    dimensions: "",
    medium: "",
    countryOfOrigin: "",
    currentCustomsStatus: "",
    category: "",
    itemType: "",
    period: "",
    weight: "",
    weightValue: undefined,
    weightUnit: undefined,
    volumetricWeightValue: undefined,
    volumetricWeightUnit: undefined,
    hasExistingCrate: undefined,
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
