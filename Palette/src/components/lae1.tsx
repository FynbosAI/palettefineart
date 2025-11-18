import * as React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Badge,
  Divider,
  TextField,
  InputAdornment,
  Button,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SearchIcon from "@mui/icons-material/Search";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import FlightTakeoffIcon from "@mui/icons-material/FlightTakeoff";
import DirectionsBoatIcon from "@mui/icons-material/DirectionsBoat";
import DeliveryDiningIcon from "@mui/icons-material/DeliveryDining";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import { useNavigate } from "react-router-dom";
import type { GeminiArtwork } from "../types/legacy";

import { API_BASE_URL } from "../config";
import { useShipmentForm } from "../hooks/useShipmentForm";
import useNotifications from "../hooks/useNotifications";
import ShippersStep, { PaletteTimeline, TOKENS } from "./lae4";
import SummaryStep from "./lae5";
import GoodsStep from "./lae2";
import RequirementsStep from "./lae3";
import NotificationDrawer from "../../../shared/notifications/NotificationDrawer";
import type { BranchNotificationWithStatus } from "../../../shared/notifications/types";
import useNotificationNavigation from "../hooks/useNotificationNavigation";
import { getDefaultArrivalDate, getTodayIsoDate } from "../lib/dateDefaults";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { AnimatePresence, motion } from "motion/react";

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type ShipmentDetails = {
  origin?: string;
  destination?: string;
  arrivalDate?: string;
  title?: string;
  clientReference?: string;
  originContactName?: string;
  originContactPhone?: string;
  originContactEmail?: string;
  destinationContactName?: string;
  destinationContactPhone?: string;
  destinationContactEmail?: string;
};

type UploadResult = {
  shipmentDetails: ShipmentDetails;
  artworkData: GeminiArtwork[];
};

const ACCEPTED_FILE_TYPES = ".pdf,.xls,.xlsx,.csv";

const sanitizeText = (value?: string | null) => {
  if (!value) return "";
  return value.trim();
};

const normalizeIsoDate = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
  return parsed.toISOString().split("T")[0];
};

async function convertGeminiArtworksToBlobs(artworks: GeminiArtwork[]): Promise<GeminiArtwork[]> {
  if (!Array.isArray(artworks) || artworks.length === 0) {
    return artworks;
  }

  return Promise.all(
    artworks.map(async (artwork) => {
      if (artwork.imageBlob) {
        return artwork;
      }

      const source =
        artwork.croppedImageUrl ??
        artwork.imagePreviewUrl ??
        artwork.imageStorageUrl;

      if (!source) {
        return artwork;
      }

      try {
        const response = await fetch(source);
        const blob = await response.blob();

        if (!blob || blob.size === 0) {
          return artwork;
        }

        return {
          ...artwork,
          imageBlob: blob,
        };
      } catch (error) {
        console.warn("[LAE_UPLOAD] Failed to convert artwork image to blob", {
          artworkId: artwork.id,
          error,
        });
        return artwork;
      }
    })
  );
}

async function renderPdfPageToPng(pdfPage: any) {
  const PIXEL_TARGET = 1536;
  const viewport = pdfPage.getViewport({ scale: 1.0 });

  let newWidth;
  let newHeight;
  if (viewport.width > viewport.height) {
    newWidth = PIXEL_TARGET;
    newHeight = (viewport.height / viewport.width) * PIXEL_TARGET;
  } else {
    newHeight = PIXEL_TARGET;
    newWidth = (viewport.width / viewport.height) * PIXEL_TARGET;
  }

  newWidth = Math.round(newWidth);
  newHeight = Math.round(newHeight);

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to get 2D context from canvas");
  }

  context.fillStyle = "white";
  context.fillRect(0, 0, newWidth, newHeight);

  const renderViewport = pdfPage.getViewport({ scale: newWidth / viewport.width });
  await pdfPage.render({ canvasContext: context, viewport: renderViewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Blob creation timeout"));
    }, 10000);

    try {
      canvas.toBlob((result) => {
        cleanup();
        if (result && result.size > 0) {
          resolve(result);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      }, "image/png");
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Canvas toBlob failed"));
    }
  });

  return { blob, width: newWidth, height: newHeight };
}

async function uploadShipmentDocument(file: File): Promise<UploadResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "pdf") {
    throw new Error("Only PDF shipment documents are supported for auto-fill at this time.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const formData = new FormData();
  formData.append("originalPdfName", file.name);

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const { blob } = await renderPdfPageToPng(page);
    const pageFile = new File([blob], `${file.name.replace(/\.pdf$/i, "")}_page_${pageIndex}.png`, {
      type: "image/png",
    });
    formData.append("images", pageFile);
  }

  const response = await fetch(`${API_BASE_URL}/api/process-images`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Failed to upload shipment details (status ${response.status}).`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Upload failed");
  }

  const shipmentDetails: ShipmentDetails =
    result.shipmentDetails && typeof result.shipmentDetails === "object"
      ? result.shipmentDetails
      : {};

  const artworkData: GeminiArtwork[] = Array.isArray(result.artworkData)
    ? result.artworkData
    : [];

  return { shipmentDetails, artworkData };
}

/* ============================================================================
   2) Pick‑up and delivery location block (built to your CSS spec)
   ==========================================================================*/

type ShippingMethod = "Select a shipping method" | "Sea freight" | "Air freight" | "Courier" | "Truck";
type Stage = "shipment" | "Transport Mode" | "goods" | "requirements" | "shippers" | "summary";
const STAGE_TO_INDEX: Record<Stage, number> = {
  shipment: 0,
  transport: 1,
  goods: 2,
  requirements: 3,
  shippers: 4,
  summary: 5,
};

const fonts = "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif";

function mapLegacyMode(value?: string | null): Mode | null {
  if (!value) return null;
  if (value === "Rail") {
    return "Road";
  }
  return value as Mode;
}

const labelStyleBase: React.CSSProperties = {
  fontFamily: fonts,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: "24px",
  color: "#170849",
};

const fieldShell: React.CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  padding: "15px 14px",
  gap: 8,
  height: 44,
  background: "#F5F6F6",
  borderRadius: 10,
};

const textInputStyle: React.CSSProperties = {
  width: "100%",
  height: 24,
  fontFamily: fonts,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: "24px",
  color: "#5D5380",
  background: "transparent",
  outline: "none",
  border: "none",
};

const selectReset: React.CSSProperties = {
  appearance: "none" as any,
  WebkitAppearance: "none" as any,
  MozAppearance: "none" as any,
  background: "transparent",
  border: "none",
  outline: "none",
  width: "100%",
  height: 24,
  fontFamily: fonts,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: "24px",
  color: "#5D5380",
  paddingRight: 20,
  cursor: "pointer",
};

function ChevronDown({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="#5D5380" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** UPDATED: allow color so we can reuse in transport view */
function PlaneIcon({ size = 16, color = "#170849" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        d="M2.5 12.5l8-1.5 8.5-8.5 2 2-8.5 8.5-1.5 8-2-2 1-4-4-1-3-1 1-2z"
        fill={color}
      />
    </svg>
  );
}

function TrackGlyph() {
  return (
    <div
      style={{
        position: "absolute",
        left: 536,
        top: 17,
        width: 104,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        zIndex: 2,
      }}
    >
      {/* teal point */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: 8.8,
          width: 24,
          height: 24,
          background: "#00AAAB",
          borderRadius: 80,
        }}
      >
        <div style={{ width: 6.4, height: 6.4, background: "#FFFFFF", borderRadius: 999 }} />
      </div>

      {/* solid teal dash */}
      <div style={{ width: 20, borderTop: "3px solid #00AAAB" }} />

      {/* plane */}
      <PlaneIcon />

      {/* dashed grey line */}
      <div style={{ width: 20, borderTop: "3px dashed #CCDFDF" }} />

      {/* destination pin */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: 6.4,
          width: 24,
          height: 24,
          background: "#CCDFDF",
          border: "0.8px solid #CCDFDF",
          borderRadius: 80,
        }}
      >
        <svg width={11.2} height={11.2} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2C8.7 2 6 4.7 6 8c0 4.4 6 14 6 14s6-9.6 6-14c0-3.3-2.7-6-6-6zm0 8.2a2.2 2.2 0 110-4.4 2.2 2.2 0 010 4.4z" fill="none" stroke="#170849" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
}

function LabeledRow({
  label,
  children,
  width,
}: {
  label: string;
  children: React.ReactNode;
  width: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: 0, gap: 4, width, height: 72 }}>
      <div style={{ ...labelStyleBase, width, height: 24 }}>{label}</div>
      <div style={{ width }}>
        {children}
      </div>
    </div>
  );
}

function LeftCard({
  fromCountry,
  setFromCountry,
  portCity,
  setPortCity,
}: {
  fromCountry: string;
  setFromCountry: (v: string) => void;
  portCity: string;
  setPortCity: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "20px 24px",
        gap: 16,
        width: 556,
        height: 200,
        background: "#FFFFFF",
        borderRadius: 10,
        flexGrow: 1,
        zIndex: 0,
      }}
    >
      <LabeledRow label="FROM country*" width={508}>
        <div style={{ ...fieldShell, width: 508 }}>
          <input
            placeholder="Enter a country"
            value={fromCountry}
            onChange={(e) => setFromCountry(e.target.value)}
            style={textInputStyle}
          />
        </div>
      </LabeledRow>

      <LabeledRow label="Port or city of loading*" width={508}>
        <div style={{ ...fieldShell, width: 508 }}>
          <input
            placeholder="Enter a port or city"
            value={portCity}
            onChange={(e) => setPortCity(e.target.value)}
            style={textInputStyle}
          />
        </div>
      </LabeledRow>
    </div>
  );
}

function RightCard({
  toLocation,
  setToLocation,
  deliveryAddress,
  setDeliveryAddress,
  zip,
  setZip,
}: {
  toLocation: string;
  setToLocation: (v: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (v: string) => void;
  zip: string;
  setZip: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "20px 24px",
        gap: 16,
        width: 556,
        height: 200,
        background: "#FFFFFF",
        borderRadius: 10,
        flexGrow: 1,
        zIndex: 1,
      }}
    >
      <LabeledRow label="TO country*" width={508}>
        <div style={{ ...fieldShell, width: 508 }}>
          <input
            placeholder="Enter a location or city"
            value={toLocation}
            onChange={(e) => setToLocation(e.target.value)}
            style={textInputStyle}
          />
        </div>
      </LabeledRow>

      {/* Address + Zip row */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          padding: 0,
          gap: 16,
          width: 508,
          height: 72,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 356 }}>
          <div style={{ ...labelStyleBase, width: 356, height: 24 }}>Delivery address*</div>
          <div style={{ ...fieldShell, width: 356 }}>
            <input
              placeholder="Enter complete address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              style={textInputStyle}
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 136, flexGrow: 1 }}>
          <div style={{ ...labelStyleBase, width: 136, height: 24 }}>Zip or code*</div>
          <div style={{ ...fieldShell, width: 136 }}>
            <input
              placeholder="Enter zip code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              style={{ ...textInputStyle, width: 108 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Accepts onNext to switch to the Transport step */
function AddressCard({
  label,
  value,
  onChange,
  contactName,
  contactPhone,
  contactEmail,
  onContactNameChange,
  onContactPhoneChange,
  onContactEmailChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  onContactNameChange: (v: string) => void;
  onContactPhoneChange: (v: string) => void;
  onContactEmailChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "20px 24px",
        gap: 16,
        width: 556,
        minHeight: 200,
        background: "#FFFFFF",
        borderRadius: 10,
        flexGrow: 1,
      }}
    >
      <LabeledRow label={label} width={508}>
        <div style={{ ...fieldShell, width: 508 }}>
          <input
            placeholder="Enter full address"
            value={value}
            onChange={(e) => onChange((e.target as HTMLInputElement).value)}
            style={textInputStyle}
          />
        </div>
      </LabeledRow>

      <LabeledRow label="Contact name*" width={508}>
        <div style={{ ...fieldShell, width: 508 }}>
          <input
            placeholder="Full name"
            value={contactName}
            onChange={(e) => onContactNameChange((e.target as HTMLInputElement).value)}
            style={textInputStyle}
          />
        </div>
      </LabeledRow>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", width: "100%" }}>
        <LabeledRow label="Contact phone*" width={248}>
          <div style={{ ...fieldShell, width: 248 }}>
            <input
              placeholder="+1 (___) ___-____"
              value={contactPhone}
              onChange={(e) => onContactPhoneChange((e.target as HTMLInputElement).value)}
              style={textInputStyle}
            />
          </div>
        </LabeledRow>
        <LabeledRow label="Contact email*" width={248}>
          <div style={{ ...fieldShell, width: 248 }}>
            <input
              placeholder="name@example.com"
              value={contactEmail}
              onChange={(e) => onContactEmailChange((e.target as HTMLInputElement).value)}
              style={textInputStyle}
            />
          </div>
        </LabeledRow>
      </div>
    </div>
  );
}

/** Accepts onNext to switch to the Transport step */
function PickupAndDelivery({
  onNext,
  fromAddress,
  toAddress,
  onFromAddressChange,
  onToAddressChange,
  fromContactName,
  fromContactPhone,
  fromContactEmail,
  toContactName,
  toContactPhone,
  toContactEmail,
  onFromContactNameChange,
  onFromContactPhoneChange,
  onFromContactEmailChange,
  onToContactNameChange,
  onToContactPhoneChange,
  onToContactEmailChange,
}: {
  onNext: () => void;
  fromAddress: string;
  toAddress: string;
  onFromAddressChange: (value: string) => void;
  onToAddressChange: (value: string) => void;
  fromContactName: string;
  fromContactPhone: string;
  fromContactEmail: string;
  toContactName: string;
  toContactPhone: string;
  toContactEmail: string;
  onFromContactNameChange: (value: string) => void;
  onFromContactPhoneChange: (value: string) => void;
  onFromContactEmailChange: (value: string) => void;
  onToContactNameChange: (value: string) => void;
  onToContactPhoneChange: (value: string) => void;
  onToContactEmailChange: (value: string) => void;
}) {
  const fromAddressValid = sanitizeText(fromAddress).length > 0;
  const toAddressValid = sanitizeText(toAddress).length > 0;
  const fromContactValid =
    sanitizeText(fromContactName).length > 0 &&
    sanitizeText(fromContactPhone).length > 0 &&
    sanitizeText(fromContactEmail).length > 0;
  const toContactValid =
    sanitizeText(toContactName).length > 0 &&
    sanitizeText(toContactPhone).length > 0 &&
    sanitizeText(toContactEmail).length > 0;
  const canProceed = fromAddressValid && toAddressValid && fromContactValid && toContactValid;

  const missingFields: string[] = [];
  if (!fromAddressValid) missingFields.push('Pickup address');
  if (!toAddressValid) missingFields.push('Delivery address');
  if (!fromContactValid) missingFields.push('Pickup contact');
  if (!toContactValid) missingFields.push('Delivery contact');

  return (
    <div
      // Right (outer) group
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 0,
        gap: 32,
        width: "100%",
        maxWidth: 1256,
        margin: "0 auto",
      }}
    >
      {/* Right-Container */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 40px",
          gap: 24,
          width: "100%",
          maxWidth: 1256,
          background: "#F0FAFA",
          borderRadius: 12,
        }}
      >
        {/* Frame 2315 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: 0,
            gap: 24,
            width: "100%",
            maxWidth: 1176,
            margin: "0 auto",
          }}
        >
          {/* Title */}
          <div
            style={{
              width: "100%",
              maxWidth: 1176,
              height: 20,
              fontFamily: fonts,
              fontStyle: "normal",
              fontWeight: 500,
              fontSize: 20,
              lineHeight: "20px",
              display: "flex",
              alignItems: "center",
              letterSpacing: "-0.02em",
              color: "#170849",
            }}
          >
            Pick-up and delivery location
          </div>

          {/* Cards row */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            padding: 0,
            gap: 64,
            isolation: "isolate" as any,
            width: "100%",
            maxWidth: 1176,
          }}
        >
            <AddressCard
              label="FROM address*"
              value={fromAddress}
              onChange={onFromAddressChange}
              contactName={fromContactName}
              contactPhone={fromContactPhone}
              contactEmail={fromContactEmail}
              onContactNameChange={onFromContactNameChange}
              onContactPhoneChange={onFromContactPhoneChange}
              onContactEmailChange={onFromContactEmailChange}
            />
            <AddressCard
              label="TO address*"
              value={toAddress}
              onChange={onToAddressChange}
              contactName={toContactName}
              contactPhone={toContactPhone}
              contactEmail={toContactEmail}
              onContactNameChange={onToContactNameChange}
              onContactPhoneChange={onToContactPhoneChange}
              onContactEmailChange={onToContactEmailChange}
            />
          </div>
        </div>

        {/* Footer row with Next button (matches sizes/colors) */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: 0,
            gap: 24,
            width: "100%",
            maxWidth: 1176,
            height: 44,
            margin: "0 auto",
          }}
        >
          {!canProceed && (
            <div style={{
              flex: 1,
              fontSize: 13,
              color: '#b71c1c',
              background: 'rgba(183, 28, 28, 0.08)',
              borderRadius: 8,
              padding: '10px 14px'
            }}>
              Please complete: {missingFields.join(', ')}
            </div>
          )}
          {/* Next button */}
          <Button
            variant="contained"
            onClick={onNext}
            disabled={!canProceed}
            disableElevation
            sx={{
              ml: "auto",
              width: 240,
              height: 44,
              borderRadius: 2,
              textTransform: "none",
              fontFamily: fonts,
              fontWeight: 500,
              fontSize: 16,
              lineHeight: "19px",
              boxShadow: "none",
              '&:hover': { boxShadow: "none" },
            }}
          >
            Next: Transport
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   2.5) Upload Shipment section + OR divider
   ==========================================================================*/

function UploadShipment({
  onShipmentDetails,
  onGeminiData,
}: {
  onShipmentDetails: (details: ShipmentDetails) => void;
  onGeminiData: (artworks: GeminiArtwork[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);
  const [isHovering, setIsHovering] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  const resetInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleUpload = async (file: File) => {
    setError(null);
    setUploadedFileName(null);
    setIsUploading(true);

    try {
      const { shipmentDetails, artworkData } = await uploadShipmentDocument(file);
      const enrichedArtworkData = await convertGeminiArtworksToBlobs(artworkData);
      const sanitized: ShipmentDetails = {
        origin: sanitizeText(shipmentDetails.origin),
        destination: sanitizeText(shipmentDetails.destination),
        arrivalDate: normalizeIsoDate(shipmentDetails.arrivalDate),
        title: sanitizeText(shipmentDetails.title),
        clientReference: sanitizeText(shipmentDetails.clientReference),
        originContactName: sanitizeText(shipmentDetails.originContactName),
        originContactPhone: sanitizeText(shipmentDetails.originContactPhone),
        originContactEmail: sanitizeText(shipmentDetails.originContactEmail),
        destinationContactName: sanitizeText(shipmentDetails.destinationContactName),
        destinationContactPhone: sanitizeText(shipmentDetails.destinationContactPhone),
        destinationContactEmail: sanitizeText(shipmentDetails.destinationContactEmail),
      };

      onShipmentDetails(sanitized);
      onGeminiData(enrichedArtworkData);
      setUploadedFileName(file.name);
      setPendingFile(null);
    } catch (uploadError) {
      console.error("Failed to upload shipment details", uploadError);
      const message = uploadError instanceof Error ? uploadError.message : "Failed to upload shipment details.";
      setError(message);
      setUploadedFileName(null);
    } finally {
      setIsUploading(false);
      resetInput();
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const file = files[0];
    if (!file || isUploading) {
      return;
    }
    setUploadedFileName(null);
    setPendingFile(file);
    setError(null);
    resetInput();
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setIsHovering(false);
      handleFiles(event.target.files);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    setIsHovering(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFiles(event.dataTransfer.files);
      event.dataTransfer.clearData();
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
    setIsHovering(false);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleClick = () => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  };

  const handleProcessPendingFile = () => {
    if (!pendingFile || isUploading) {
      return;
    }
    void handleUpload(pendingFile);
  };

  const handleMouseEnter = () => {
    if (!isUploading) {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  React.useEffect(() => {
    if (isUploading) {
      setIsHovering(false);
    }
  }, [isUploading]);

  const canInteractWithUpload = !isUploading;
  const isHoverCardActive = canInteractWithUpload && isHovering && !dragActive;
  const hoverBackground = "rgba(181, 135, 232, 0.15)";
  const dragBackground = "rgba(181, 135, 232, 0.3)";
  const hoverShadow = "0 6px 16px rgba(0, 0, 0, 0.1)";
  const dragShadow = "0 8px 20px rgba(0, 0, 0, 0.15)";
  const hasReceivedFile = Boolean(pendingFile || isUploading || (uploadedFileName && !error));
  const fileDisplayName = pendingFile?.name ?? uploadedFileName ?? "";

  const renderStatus = () => {
    const status = isUploading ? "loading" : uploadedFileName && !error ? "success" : "idle";

    if (status === "idle") {
      return null;
    }

    const processingName = pendingFile?.name ?? uploadedFileName ?? "document";

    return (
      <AnimatePresence mode="wait">
        {status === "loading" ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, mt: 2 }}>
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <CircularProgress size={18} color="primary" />
              </motion.div>
              <Typography variant="body2" color="text.secondary">
                Processing {processingName}…
              </Typography>
            </Box>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                mt: 2,
                color: "success.main",
              }}
            >
              <CheckCircleOutlineIcon fontSize="small" color="success" />
              <Typography variant="body2" color="success.main">
                Successfully processed {uploadedFileName}
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  return (
    <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <div
        className="file-upload-container"
        style={{
          width: "100%",
          maxWidth: 1256,
          background: "#F0FAFA",
          borderRadius: 12,
          padding: 24,
          gap: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleChange}
          style={{ display: "none" }}
        />

        <div className="file-upload-header">
          <h2>Upload shipment details</h2>
          <p>Upload a file with your shipment details to create a new shipment.</p>
        </div>

        {error ? (
          <Alert severity="error" sx={{ width: "100%" }}>
            {error}
          </Alert>
        ) : null}

        <div
          className="file-drop-zone"
          role="button"
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: canInteractWithUpload ? "pointer" : "not-allowed",
            border: `2px dashed ${
              dragActive
                ? TOKENS.primary
                : isHoverCardActive
                  ? TOKENS.primary
                  : TOKENS.primaryLight
            }`,
            background: dragActive
              ? dragBackground
              : isHoverCardActive
                ? hoverBackground
                : "#FFFFFF",
            pointerEvents: isUploading ? "none" : "auto",
            transition: "all 0.2s ease",
            boxShadow: dragActive ? dragShadow : isHoverCardActive ? hoverShadow : "none",
            transform: isHoverCardActive ? "translateY(-2px)" : "none",
          }}
        >
          <div className="file-drop-zone-content">
            <div className="file-drop-zone-icon-container">
              {hasReceivedFile ? (
                <InsertDriveFileIcon sx={{ fontSize: 32, color: TOKENS.primary }} />
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 16.5V3M12 16.5L8.5 13M12 16.5L15.5 13M5 21H19"
                    stroke="#8412FF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="matrix(1, 0, 0, -1, 0, 24)"
                  />
                </svg>
              )}
            </div>
            <div className="file-drop-zone-text-container">
              {hasReceivedFile ? (
                <>
                  <div className="file-drop-zone-action-text" style={{ fontWeight: 600, textTransform: "none" }}>
                    {fileDisplayName || "Document ready"}
                  </div>
                  <div className="file-drop-zone-supporting-text">
                    {pendingFile
                      ? 'Ready to process. Click "Process file" below to continue.'
                      : isUploading
                        ? "Processing document…"
                        : "Document processed successfully."}
                  </div>
                </>
              ) : (
                <>
                  <div className="file-drop-zone-action-text">
                    <span
                      className="upload-link"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!isUploading) {
                          handleClick();
                        }
                      }}
                    >
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </div>
                  <div className="file-drop-zone-supporting-text">
                    PDF files work best. XLS, CSV, or other supported file types
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {pendingFile && !isUploading ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={{ width: "100%", display: "flex", justifyContent: "center" }}
          >
            <Button
              variant="contained"
              color="primary"
              onClick={handleProcessPendingFile}
              sx={{
                mt: 2,
                textTransform: "none",
                fontWeight: 600,
                borderRadius: "999px",
                px: 3,
              }}
            >
              Process file
            </Button>
          </motion.div>
        ) : null}

        {renderStatus()}
      </div>
    </Box>
  );
}

function OrDivider() {
  return (
    <div style={{ width: "100%", maxWidth: 1256, display: "flex", alignItems: "center", gap: 12, margin: "0 auto" }}>
      <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: 1.2,
          color: "#170849",
        }}>OR</div>
        <div style={{
          fontFamily: "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif",
          fontWeight: 500,
          fontSize: 12,
          color: "rgba(23, 8, 73, 0.7)",
        }}>
          Upload document to auto-populate your shipment, or do it manually.
        </div>
      </div>
      <div style={{ flex: 1, height: 1, background: TOKENS.border }} />
    </div>
  );
}

/* ============================================================================
   NEW: TransportType screen (matches your spec, only "Shipment mode" block)
   ==========================================================================*/

type Mode = "Air" | "Sea" | "Courier" | "Road";
type TransportSubtype = "Dedicated" | "Consolidated" | "Shuttle";

function ShipIcon({ color = "#5D5280" }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 14l9-4 9 4-3 1.5V18H6v-2.5L3 14zm0 4c2 2 5 3 9 3s7-1 9-3" fill={color} />
    </svg>
  );
}
function CourierIcon({ color = "#5D5280" }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4.75 7.5A2.75 2.75 0 0 1 7.5 4.75h9a2.75 2.75 0 0 1 2.75 2.75v8a2.75 2.75 0 0 1-2.75 2.75h-9A2.75 2.75 0 0 1 4.75 15.5v-8Z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.75 10.5h14.5M12 4.75v5.75M9 13h3v3H9Z"
        fill={color}
        stroke={color}
        strokeWidth={0}
      />
    </svg>
  );
}
function TruckIcon({ color = "#5D5280" }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="7" width="12" height="8" rx="1" fill={color} />
      <path d="M14 10h4l3 3v2h-7" fill={color} />
      <circle cx="7" cy="18" r="2" fill={color} />
      <circle cx="18" cy="18" r="2" fill={color} />
    </svg>
  );
}

const MODE_CONFIG: Record<
  Mode,
  {
    label: Mode;
    badge: string;
    description: string;
    renderIcon: (color: string) => React.ReactNode;
  }
> = {
  Air: {
    label: "Air",
    badge: "Fastest arrival",
    description: "Premier option: fastest timeline, highest cost, highest CO₂.",
    renderIcon: (color) => (
      <FlightTakeoffIcon style={{ fontSize: 28, color }} />
    ),
  },
  Sea: {
    label: "Sea",
    badge: "Most sustainable",
    description: "Best for large loads: lowest cost, lowest CO₂, longest transit.",
    renderIcon: (color) => (
      <DirectionsBoatIcon style={{ fontSize: 28, color }} />
    ),
  },
  Courier: {
    label: "Courier",
    badge: "Door-to-door",
    description: "Quick door-to-door for small crates, premium pricing, moderate CO₂ footprint.",
    renderIcon: (color) => (
      <DeliveryDiningIcon style={{ fontSize: 28, color }} />
    ),
  },
  Road: {
    label: "Road",
    badge: "Balanced",
    description: "Regional ground service: moderate cost, flexible timing, mid CO₂.",
    renderIcon: (color) => (
      <LocalShippingIcon style={{ fontSize: 28, color }} />
    ),
  },
};

const MODE_SEQUENCE: Mode[] = ["Air", "Sea", "Courier", "Road"];

const SUBTYPE_OPTIONS: Record<Mode, TransportSubtype[]> = {
  Air: ["Dedicated", "Consolidated"],
  Sea: ["Dedicated", "Consolidated"],
  Courier: [],
  Road: ["Dedicated", "Shuttle"],
};

const SUBTYPE_DESCRIPTIONS: Record<TransportSubtype, string> = {
  Dedicated: "One vehicle or container reserved for your artwork only.",
  Consolidated: "Share space with other clients to reduce cost; adds a little time.",
  Shuttle: "Recurring shared routes for regional deliveries; balanced speed and price.",
};

function ModeTag({
  mode,
  selected,
  onClick,
}: {
  mode: Mode;
  selected: boolean;
  onClick: () => void;
}) {
  const config = MODE_CONFIG[mode];
  const border = selected ? "#8412FF" : "#E1E5EA";
  const accent = selected ? "#8412FF" : "#5D5280";
  const surface = selected ? "rgba(132, 18, 255, 0.08)" : "#FFFFFF";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "20px 12px",
        width: 121,
        minHeight: 170,
        background: surface,
        border: `1.5px solid ${border}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "border-color 0.2s ease, background-color 0.2s ease",
        textAlign: "center",
      }}
      aria-pressed={selected}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: selected ? "rgba(132, 18, 255, 0.12)" : "rgba(23, 8, 73, 0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {config.renderIcon(accent)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontFamily: fonts,
            fontWeight: 600,
            fontSize: 16,
            lineHeight: "16px",
            letterSpacing: "-0.02em",
            color: "#170849",
          }}
        >
          {config.label}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 10px",
            borderRadius: 999,
            fontFamily: fonts,
            fontWeight: 500,
            fontSize: 11,
            letterSpacing: "0.02em",
            color: selected ? "#481699" : "#4F5B6C",
            backgroundColor: selected ? "rgba(132, 18, 255, 0.14)" : "rgba(23, 8, 73, 0.08)",
          }}
        >
          {config.badge}
        </span>
      </div>
      <span
        style={{
          fontFamily: fonts,
          fontWeight: 500,
          fontSize: 12,
          lineHeight: "18px",
          letterSpacing: "-0.01em",
          color: "rgba(23, 8, 73, 0.72)",
        }}
      >
        {config.description}
      </span>
    </button>
  );
}

function SubtypeTag({
  subtype,
  description,
  selected,
  onClick,
}: {
  subtype: TransportSubtype;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        padding: "14px 16px",
        minWidth: 164,
        maxWidth: 200,
        borderRadius: 10,
        border: `1.5px solid ${selected ? "#8412FF" : "#E1E5EA"}`,
        backgroundColor: selected ? "rgba(132, 18, 255, 0.08)" : "#FFFFFF",
        cursor: "pointer",
        transition: "border-color 0.2s ease, background-color 0.2s ease",
        textAlign: "left",
      }}
    >
      <span
        style={{
          fontFamily: fonts,
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: "-0.01em",
          color: "#170849",
        }}
      >
        {subtype}
      </span>
      <span
        style={{
          fontFamily: fonts,
          fontWeight: 500,
          fontSize: 12,
          lineHeight: "18px",
          color: "rgba(23, 8, 73, 0.72)",
        }}
      >
        {description}
      </span>
    </button>
  );
}

function TransportType({
  selected,
  selectedSubtype,
  onSelect,
  onSubtypeSelect,
  onBack,
  onNext,
}: {
  selected: Mode | null;
  selectedSubtype: TransportSubtype | null;
  onSelect: (m: Mode) => void;
  onSubtypeSelect: (value: TransportSubtype | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const availableSubtypes = selected ? SUBTYPE_OPTIONS[selected] : [];
  const requiresSubtype = availableSubtypes.length > 0;
  const disableNext = !selected || (requiresSubtype && !selectedSubtype);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 32,
        width: 1256,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          padding: "32px 40px",
          gap: 24,
          width: 1256,
          background: "#F0FAFA",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 24,
            width: 1176,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "100%",
            }}
          >
            <div
              style={{
                fontFamily: fonts,
                fontWeight: 500,
                fontSize: 20,
                lineHeight: "100%",
                letterSpacing: "-0.02em",
                color: "#170849",
              }}
            >
              Transport mode
            </div>
            <div
              style={{
                fontFamily: fonts,
                fontWeight: 500,
                fontSize: 14,
                lineHeight: "20px",
                color: "rgba(23, 8, 73, 0.7)",
                maxWidth: 600,
              }}
            >
              Choose the mode that balances cost, speed, and environmental impact for this shipment.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
            }}
          >
            {MODE_SEQUENCE.map((modeKey) => (
              <ModeTag
                key={modeKey}
                mode={modeKey}
                selected={selected === modeKey}
                onClick={() => onSelect(modeKey)}
              />
            ))}
          </div>

          {requiresSubtype && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                width: "100%",
              }}
            >
              <div
                style={{
                  fontFamily: fonts,
                  fontWeight: 500,
                  fontSize: 14,
                  color: "#170849",
                }}
              >
                Transport type
              </div>
              <div
                style={{
                  fontFamily: fonts,
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: "18px",
                  color: "rgba(23, 8, 73, 0.7)",
                  maxWidth: 560,
                }}
              >
                Dedicated reserves the vehicle for your artwork. Consolidated shares transit to reduce cost, and Shuttle covers recurring ground routes.
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                {availableSubtypes.map((subtype) => (
                  <SubtypeTag
                    key={subtype}
                    subtype={subtype}
                    description={SUBTYPE_DESCRIPTIONS[subtype]}
                    selected={selectedSubtype === subtype}
                    onClick={() => onSubtypeSelect(subtype)}
                  />
                ))}
              </div>
              {requiresSubtype && !selectedSubtype && (
                <div
                  style={{
                    fontFamily: fonts,
                    fontWeight: 500,
                    fontSize: 12,
                    color: "#D94E45",
                  }}
                >
                  Select a transport type to continue.
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            width: "100%",
            maxWidth: 1176,
            paddingTop: 8,
          }}
        >
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
              '&:hover': {
                backgroundColor: "rgba(132, 18, 255, 0.08)",
              },
            }}
          >
            Back
          </Button>

          <Button
            variant="contained"
            disableElevation
            disabled={disableNext}
            onClick={() => {
              if (disableNext) return;
              onNext();
            }}
            sx={{
              ml: "auto",
              width: 240,
              height: 44,
              borderRadius: 2,
              textTransform: "none",
              fontFamily: fonts,
              fontWeight: 500,
              fontSize: 16,
              lineHeight: "19px",
              boxShadow: "none",
              "&.Mui-disabled": {
                backgroundColor: "#CBC3E3",
                color: "#FFFFFF",
                opacity: 1,
                cursor: "not-allowed",
              },
              "&:hover": {
                backgroundColor: "#8412FF",
                boxShadow: "0px 20px 30px -10px rgba(25, 5, 52, 0.45)",
              },
            }}
          >
            Next: Artwork Details
          </Button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================================
   3) Page composition – now toggles between Shipment and Transport
   ==========================================================================*/

export default function ShipmentPage() {
  const [stage, setStage] = React.useState<Stage>("shipment");

  const {
    shipmentForm,
    uploadState,
    updateShipmentForm,
    updateDates,
    setShipmentData,
    setGeminiArtworkData,
  } = useShipmentForm();

  const [mode, setMode] = React.useState<Mode | null>(() => mapLegacyMode(shipmentForm.transportMode));
  const [transportType, setTransportType] = React.useState<TransportSubtype | null>(
    () => (shipmentForm.transportType ?? null) as TransportSubtype | null
  );
  React.useEffect(() => {
    const trimmedArrival = shipmentForm.arrivalDate?.trim() ?? '';
    const arrivalDateValue = trimmedArrival ? new Date(trimmedArrival) : null;
    const todayValue = new Date(getTodayIsoDate());
    const arrivalIsInvalid =
      !arrivalDateValue || Number.isNaN(arrivalDateValue.getTime());
    const shouldHydrateDefault =
      arrivalIsInvalid || arrivalDateValue <= todayValue;
    if (!shouldHydrateDefault) {
      return;
    }
    const defaultArrival = getDefaultArrivalDate();
    if (trimmedArrival === defaultArrival) {
      return;
    }
    updateDates(
      defaultArrival,
      shipmentForm.targetDateStart,
      shipmentForm.targetDateEnd
    );
    setShipmentData({ arrivalDate: defaultArrival });
  }, [
    setShipmentData,
    shipmentForm.arrivalDate,
    shipmentForm.targetDateEnd,
    shipmentForm.targetDateStart,
    updateDates,
  ]);

  React.useEffect(() => {
    const normalized = mapLegacyMode(shipmentForm.transportMode);
    if (normalized !== mode) {
      setMode(normalized);
    }
  }, [mode, shipmentForm.transportMode]);

  React.useEffect(() => {
    const storeSubtype = (shipmentForm.transportType ?? null) as TransportSubtype | null;
    if (storeSubtype !== transportType) {
      setTransportType(storeSubtype);
    }
  }, [shipmentForm.transportType, transportType]);

  React.useEffect(() => {
    if (!mode) {
      if (transportType !== null) {
        setTransportType(null);
        if (shipmentForm.transportType !== null) {
          updateShipmentForm({ transportType: null });
        }
      }
      return;
    }

    const allowed = SUBTYPE_OPTIONS[mode];
    if (allowed.length === 0) {
      if (transportType !== null) {
        setTransportType(null);
        if (shipmentForm.transportType !== null) {
          updateShipmentForm({ transportType: null });
        }
      }
      return;
    }

    if (transportType && allowed.includes(transportType)) {
      if (shipmentForm.transportType !== transportType) {
        updateShipmentForm({ transportType });
      }
      return;
    }

    const fallback = allowed[0];
    setTransportType(fallback);
    if (shipmentForm.transportType !== fallback) {
      updateShipmentForm({ transportType: fallback });
    }
  }, [mode, transportType, shipmentForm.transportType, updateShipmentForm]);

  const handleModeSelect = React.useCallback(
    (value: Mode) => {
      const allowed = SUBTYPE_OPTIONS[value];
      const nextSubtype: TransportSubtype | null =
        allowed.length > 0
          ? (transportType && allowed.includes(transportType) ? transportType : allowed[0])
          : null;

      setMode(value);
      setTransportType(nextSubtype);
      updateShipmentForm({ transportMode: value, transportType: nextSubtype });
    },
    [transportType, updateShipmentForm]
  );

  const handleSubtypeSelect = React.useCallback(
    (value: TransportSubtype | null) => {
      setTransportType(value);
      updateShipmentForm({ transportType: value });
    },
    [updateShipmentForm]
  );

  const handleGeminiData = React.useCallback(
    (artworks: GeminiArtwork[]) => {
      setGeminiArtworkData(artworks.length > 0 ? artworks : null);
    },
    [setGeminiArtworkData]
  );

  const goToTransport = React.useCallback(() => setStage("transport"), []);
  const goToShipment = React.useCallback(() => setStage("shipment"), []);
  const goToGoods = React.useCallback(() => {
    if (mode) {
      updateShipmentForm({ transportMode: mode, transportType });
    }
    setStage("goods");
  }, [mode, transportType, updateShipmentForm]);
  const goToRequirements = React.useCallback(() => {
    setStage("requirements");
  }, []);
  const goToShippers = React.useCallback(() => {
    setStage("shippers");
  }, []);
  const goToSummary = React.useCallback(() => {
    setStage("summary");
  }, []);

  const [fromAddress, setFromAddress] = React.useState(() =>
    sanitizeText(
      shipmentForm.origin ?? uploadState.shipmentData?.origin ?? ""
    )
  );
  const [toAddress, setToAddress] = React.useState(() =>
    sanitizeText(
      shipmentForm.destination ?? uploadState.shipmentData?.destination ?? ""
    )
  );
  const [fromContactName, setFromContactName] = React.useState(() =>
    sanitizeText(
      shipmentForm.originContactName ?? uploadState.shipmentData?.originContactName ?? ""
    )
  );
  const [fromContactPhone, setFromContactPhone] = React.useState(() =>
    sanitizeText(
      shipmentForm.originContactPhone ?? uploadState.shipmentData?.originContactPhone ?? ""
    )
  );
  const [fromContactEmail, setFromContactEmail] = React.useState(() =>
    sanitizeText(
      shipmentForm.originContactEmail ?? uploadState.shipmentData?.originContactEmail ?? ""
    )
  );
  const [toContactName, setToContactName] = React.useState(() =>
    sanitizeText(
      shipmentForm.destinationContactName ?? uploadState.shipmentData?.destinationContactName ?? ""
    )
  );
  const [toContactPhone, setToContactPhone] = React.useState(() =>
    sanitizeText(
      shipmentForm.destinationContactPhone ?? uploadState.shipmentData?.destinationContactPhone ?? ""
    )
  );
  const [toContactEmail, setToContactEmail] = React.useState(() =>
    sanitizeText(
      shipmentForm.destinationContactEmail ?? uploadState.shipmentData?.destinationContactEmail ?? ""
    )
  );

  const handleShipmentDetails = React.useCallback(
    (details: ShipmentDetails) => {
      const origin = sanitizeText(details.origin);
      const destination = sanitizeText(details.destination);
      const arrivalDate = normalizeIsoDate(details.arrivalDate);
      const title = sanitizeText(details.title);
      const clientReference = sanitizeText(details.clientReference);
      const originContactName = sanitizeText(details.originContactName);
      const originContactPhone = sanitizeText(details.originContactPhone);
      const originContactEmail = sanitizeText(details.originContactEmail);
      const destinationContactName = sanitizeText(details.destinationContactName);
      const destinationContactPhone = sanitizeText(details.destinationContactPhone);
      const destinationContactEmail = sanitizeText(details.destinationContactEmail);

      setFromAddress(origin);
      setToAddress(destination);
      setFromContactName(originContactName);
      setFromContactPhone(originContactPhone);
      setFromContactEmail(originContactEmail);
      setToContactName(destinationContactName);
      setToContactPhone(destinationContactPhone);
      setToContactEmail(destinationContactEmail);

      updateShipmentForm({
        origin,
        destination,
        arrivalDate,
        title,
        clientReference,
        originContactName,
        originContactPhone,
        originContactEmail,
        destinationContactName,
        destinationContactPhone,
        destinationContactEmail,
      });

      setShipmentData({
        origin,
        destination,
        arrivalDate,
        title,
        clientReference,
        originContactName,
        originContactPhone,
        originContactEmail,
        destinationContactName,
        destinationContactPhone,
        destinationContactEmail,
      });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleFromAddressChange = React.useCallback(
    (value: string) => {
      setFromAddress(value);
      updateShipmentForm({ origin: value });
      setShipmentData({ origin: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleToAddressChange = React.useCallback(
    (value: string) => {
      setToAddress(value);
      updateShipmentForm({ destination: value });
      setShipmentData({ destination: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleFromContactNameChange = React.useCallback(
    (value: string) => {
      setFromContactName(value);
      updateShipmentForm({ originContactName: value });
      setShipmentData({ originContactName: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleFromContactPhoneChange = React.useCallback(
    (value: string) => {
      setFromContactPhone(value);
      updateShipmentForm({ originContactPhone: value });
      setShipmentData({ originContactPhone: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleFromContactEmailChange = React.useCallback(
    (value: string) => {
      setFromContactEmail(value);
      updateShipmentForm({ originContactEmail: value });
      setShipmentData({ originContactEmail: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleToContactNameChange = React.useCallback(
    (value: string) => {
      setToContactName(value);
      updateShipmentForm({ destinationContactName: value });
      setShipmentData({ destinationContactName: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleToContactPhoneChange = React.useCallback(
    (value: string) => {
      setToContactPhone(value);
      updateShipmentForm({ destinationContactPhone: value });
      setShipmentData({ destinationContactPhone: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const handleToContactEmailChange = React.useCallback(
    (value: string) => {
      setToContactEmail(value);
      updateShipmentForm({ destinationContactEmail: value });
      setShipmentData({ destinationContactEmail: value });
    },
    [setShipmentData, updateShipmentForm]
  );

  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    loadingMore: notificationsLoadingMore,
    hasMore: notificationsHasMore,
    error: notificationsError,
    fetchMore: fetchMoreNotifications,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
  } = useNotifications();
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const resolveNotificationTarget = useNotificationNavigation();
  const [shipmentSearchTerm, setShipmentSearchTerm] = React.useState("");

  const handleOpenNotifications = React.useCallback(() => {
    setNotificationsOpen(true);
  }, []);

  const handleCloseNotifications = React.useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const handleSelectNotification = React.useCallback(
    (notification: BranchNotificationWithStatus) => {
      void markNotificationRead(notification.id);
      const target = resolveNotificationTarget(notification);
      if (target) {
        navigate(target);
      }
      setNotificationsOpen(false);
    },
    [markNotificationRead, navigate, resolveNotificationTarget]
  );

  const handleLoadMoreNotifications = React.useCallback(() => {
    fetchMoreNotifications();
  }, [fetchMoreNotifications]);

  const handleMarkAllNotificationsRead = React.useCallback(() => {
    markAllNotificationsRead();
  }, [markAllNotificationsRead]);

  const submitShipmentSearch = React.useCallback(() => {
    const trimmed = shipmentSearchTerm.trim();
    if (trimmed) {
      navigate(`/logistics?search=${encodeURIComponent(trimmed)}`);
    } else {
      navigate("/logistics");
    }
  }, [navigate, shipmentSearchTerm]);

  const handleShipmentSearchSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitShipmentSearch();
    },
    [submitShipmentSearch]
  );

  return (
    <div className="main-wrap">
      <div className="main-panel">
        <header className="header">
          <div
            className="header-row"
            style={{ alignItems: "center", height: "auto" }}
          >
            <Typography variant="h5" sx={{ fontWeight: 600, color: "#170849" }}>
              New Estimate
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
                justifyContent: { xs: "flex-end", sm: "flex-end" },
                marginLeft: "auto",
              }}
            >
              <Box
                component="form"
                onSubmit={handleShipmentSearchSubmit}
                sx={{
                  width: { xs: "100%", sm: 320 },
                  maxWidth: 320,
                  minWidth: 200,
                  flex: { xs: "1 1 100%", sm: "0 0 auto" },
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  type="search"
                  value={shipmentSearchTerm}
                  onChange={(event) => setShipmentSearchTerm(event.target.value)}
                  placeholder="Search shipments"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: "#730ADD" }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "10px",
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "10px",
                      height: 44,
                      "& fieldset": {
                        borderColor: "#E9EAEB",
                      },
                      "&:hover fieldset": {
                        borderColor: "#BDBDBD",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#8412FF",
                      },
                    },
                  }}
                />
              </Box>

              <IconButton
                aria-label="Notifications"
                onClick={handleOpenNotifications}
                sx={{
                  width: 40,
                  height: 36,
                  borderRadius: "6px",
                  padding: "6px",
                  color: "#170849",
                  backgroundColor: "transparent",
                  transition: "background-color 0.2s ease",
                  "&:hover": { backgroundColor: "rgba(132, 18, 255, 0.08)" },
                }}
              >
                <Badge
                  color="error"
                  overlap="circular"
                  badgeContent={unreadCount > 9 ? "9+" : unreadCount || null}
                  sx={{ "& .MuiBadge-badge": { fontSize: "0.65rem", minWidth: 18, height: 18 } }}
                >
                  <NotificationsNoneIcon sx={{ fontSize: 20 }} />
                </Badge>
              </IconButton>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "12px",
                  padding: 0,
                  width: 98,
                  minWidth: 98,
                  height: 36,
                }}
              >
                <img
                  src="/logo_full.png"
                  alt="Palette Art Shipping"
                  style={{ width: "100%", maxWidth: "97.74px", maxHeight: "24px", objectFit: "contain" }}
                />
              </Box>
            </Box>
          </div>
        </header>

        <div
          className="main-content"
          style={{
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
            padding: "24px 32px",
            width: "100%",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1256,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
            }}
          >
            <PaletteTimeline current={STAGE_TO_INDEX[stage]} />

            {stage === "shipment" ? (
              <>
                <UploadShipment
                  onShipmentDetails={handleShipmentDetails}
                  onGeminiData={handleGeminiData}
                />
                <OrDivider />
                <PickupAndDelivery
                  onNext={goToTransport}
                  fromAddress={fromAddress}
                  toAddress={toAddress}
                  onFromAddressChange={handleFromAddressChange}
                  onToAddressChange={handleToAddressChange}
                  fromContactName={fromContactName}
                  fromContactPhone={fromContactPhone}
                  fromContactEmail={fromContactEmail}
                  toContactName={toContactName}
                  toContactPhone={toContactPhone}
                  toContactEmail={toContactEmail}
                  onFromContactNameChange={handleFromContactNameChange}
                  onFromContactPhoneChange={handleFromContactPhoneChange}
                  onFromContactEmailChange={handleFromContactEmailChange}
                  onToContactNameChange={handleToContactNameChange}
                  onToContactPhoneChange={handleToContactPhoneChange}
                  onToContactEmailChange={handleToContactEmailChange}
                />
              </>
            ) : stage === "transport" ? (
              <TransportType
                selected={mode}
                selectedSubtype={transportType}
                onSelect={handleModeSelect}
                onSubtypeSelect={handleSubtypeSelect}
                onBack={goToShipment}
                onNext={goToGoods}
              />
            ) : stage === "goods" ? (
              <GoodsStep onBack={goToTransport} onNext={goToRequirements} />
            ) : stage === "requirements" ? (
              <RequirementsStep onBack={goToGoods} onNext={goToShippers} />
            ) : stage === "shippers" ? (
              <ShippersStep onBack={goToRequirements} onNext={goToSummary} />
            ) : (
              <SummaryStep onBack={goToShippers} />
            )}
          </div>
        </div>
        <NotificationDrawer
          open={notificationsOpen}
          onClose={handleCloseNotifications}
          notifications={notifications}
          loading={notificationsLoading}
          loadingMore={notificationsLoadingMore}
          hasMore={notificationsHasMore}
          onLoadMore={handleLoadMoreNotifications}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onSelectNotification={handleSelectNotification}
          error={notificationsError}
        />
      </div>
    </div>
  );
}
