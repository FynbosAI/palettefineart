import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Alert, Button, CircularProgress } from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { DEFAULT_DEADLINE_HOUR, computeDefaultDeadline } from "./OriginDestination";

import { useShipmentForm } from "../hooks/useShipmentForm";
import type { SelectedShipperContext, Shipper } from "../types";
import {
  LogisticsPartnerService,
  type LogisticsPartnerBranchRecord,
  type LogisticsPartnerFilterMeta,
} from "../lib/supabase";

/***** TOKENS *****/
export const TOKENS = {
  primary: "#8412FF",
  primaryLight: "#B587E8",
  primaryDark: "#730ADD",
  secondary: "#00AAAB",
  text: "#181D27",
  border: "#E9EAEB",
  lavender: "#EAD9F9",
  tickPurple: "#8413FF",
};

const organizationLogoAssets = import.meta.glob("../../public/logos/*.{png,svg}", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

type OrganizationLogoEntry = {
  svg?: string;
  png?: string;
};

const CORPORATE_SUFFIXES = [
  "inc",
  "inc.",
  "llc",
  "l.l.c.",
  "ltd",
  "ltd.",
  "co",
  "co.",
  "company",
  "corp",
  "corp.",
  "corporation",
];

const organizationLogoMap = new Map<string, OrganizationLogoEntry>();

const canonicalizeLogoKey = (value: string, stripSuffix: boolean): string => {
  let working = value.trim().toLowerCase();
  if (!working) return "";

  working = working
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!working) return "";

  if (stripSuffix) {
    const parts = working.split(" ");
    while (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (CORPORATE_SUFFIXES.includes(last)) {
        parts.pop();
      } else {
        break;
      }
    }
    working = parts.join(" ");
  }

  return working.trim();
};

const createLogoKeys = (value: string | null | undefined): string[] => {
  if (!value) return [];
  const base = value.trim();
  if (!base) return [];

  const lowerCollapsed = base.toLowerCase().replace(/\s+/g, " ").trim();
  const canonical = canonicalizeLogoKey(base, false);
  const canonicalNoSuffix = canonicalizeLogoKey(base, true);

  const set = new Set<string>();
  if (lowerCollapsed) set.add(lowerCollapsed);
  if (canonical) set.add(canonical);
  if (canonicalNoSuffix) set.add(canonicalNoSuffix);

  return Array.from(set);
};

const getOrCreateLogoEntry = (keys: string[]): OrganizationLogoEntry => {
  let entry: OrganizationLogoEntry | undefined;
  for (const key of keys) {
    if (!key) continue;
    const existing = organizationLogoMap.get(key);
    if (existing) {
      entry = existing;
      break;
    }
  }

  if (!entry) {
    entry = {};
  }

  keys.forEach((key) => {
    if (key) {
      organizationLogoMap.set(key, entry as OrganizationLogoEntry);
    }
  });

  return entry;
};

Object.entries(organizationLogoAssets).forEach(([path, url]) => {
  const fileName = path.split("/").pop();
  if (!fileName) return;

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return;

  const baseName = fileName.slice(0, dotIndex);
  const extension = fileName.slice(dotIndex + 1).toLowerCase();
  const keys = createLogoKeys(baseName);
  if (keys.length === 0) return;

  const entry = getOrCreateLogoEntry(keys);

  if (extension === "svg" && !entry.svg) {
    entry.svg = url;
  } else if (extension === "png" && !entry.png) {
    entry.png = url;
  }

  keys.forEach((key) => {
    if (key) {
      organizationLogoMap.set(key, entry);
    }
  });
});

const findOrganizationLogoUrl = (name: string | null | undefined): string | null => {
  if (!name) return null;
  const keys = createLogoKeys(name);
  for (const key of keys) {
    if (!key) continue;
    const entry = organizationLogoMap.get(key);
    if (entry) {
      return entry.svg ?? entry.png ?? null;
    }
  }
  return null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/***** TIMELINE (extracted component) *****/
export type TimelineStep = { id: string; label: string };
export type TimelineItem = {
  step: TimelineStep;
  index: number;
  status: "completed" | "current" | "upcoming";
};

export type PaletteTimelineProps = {
  steps?: TimelineStep[];
  /** 0-based index of current step */
  current?: number;
  onStepClick?: (index: number, step: TimelineStep) => void;
  className?: string;
  surfaceClassName?: string;
  /** min px width for connectors */
  connectorMin?: number;
  /** optional extra class for list gap (if you use a CSS framework) */
  gapClassName?: string;
  stepperClassName?: string;
  stepperStyle?: React.CSSProperties;
};

export const DEFAULT_STEPS: TimelineStep[] = [
  { id: "shipment", label: "Shipment" },
  { id: "transport", label: "Transport mode" },
  { id: "goods", label: "Artwork details" },
  { id: "requirements", label: "Requirements" }, // renamed from Information
  { id: "shippers", label: "Select shippers" }, // inserted before Submit estimate
  { id: "summary", label: "Submit estimate" },
];

export function deriveTimeline(
  stepsInput: TimelineStep[] | undefined | null,
  currentInput: number | undefined | null
): TimelineItem[] {
  const steps = Array.isArray(stepsInput) ? stepsInput : [];
  const n = steps.length;
  const raw =
    typeof currentInput === "number" && Number.isFinite(currentInput)
      ? Math.trunc(currentInput)
      : 0;
  const clamped = n === 0 ? -1 : Math.min(Math.max(raw, 0), n - 1);

  return steps.map((step, i) => {
    let status: TimelineItem["status"] = "upcoming";
    if (clamped >= 0) {
      status = i < clamped ? "completed" : i === clamped ? "current" : "upcoming";
    }
    return { step, index: i, status };
  });
}

export function PaletteTimeline({
  steps = DEFAULT_STEPS,
  current = 0,
  onStepClick,
  className,
  surfaceClassName,
  connectorMin = 90,
  gapClassName,
  stepperClassName,
  stepperStyle,
}: PaletteTimelineProps) {
  const items = React.useMemo(() => deriveTimeline(steps, current), [steps, current]);

  const stepperCSS: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0px 24px",
    width: "1256px", // FIX: JSX expects px string here in some toolchains
    height: "52px",
    borderRadius: 6,
    flex: "none",
    order: 0,
    alignSelf: "stretch",
    flexGrow: 0,
  };

  return (
    <div
      className={surfaceClassName}
      style={{ backgroundColor: "#FFFFFF", width: "1256px" }} // FIX
      data-testid="timeline-surface"
    >
      <div
        className={stepperClassName}
        style={{ ...stepperCSS, ...stepperStyle }}
        data-testid="timeline-stepper"
      >
        <nav
          aria-label="Progress"
          className={className}
          style={{ fontFamily: "DM Sans, Helvetica Neue, Arial, sans-serif", width: "100%" }}
        >
          <ol
            className={gapClassName}
            role="list"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            {items.map(({ step, index, status }) => {
              const isCurrent = status === "current";
              const isCompleted = status === "completed";

              // Completed + Upcoming: lavender dot; Completed additionally shows purple tick.
              // Current step: white dot with thicker teal ring.
              let dotStyle: React.CSSProperties = isCurrent
                ? { background: "#FFFFFF", border: `3px solid ${TOKENS.secondary}` }
                : { background: TOKENS.lavender };

              // Show tick for all steps already completed
              const showCompletedTick = isCompleted;

              const labelStyle: React.CSSProperties = {
                fontSize: 16,
                lineHeight: "16px",
                fontWeight: isCurrent ? 600 : 500,
                color: TOKENS.text,
              };

              const ariaLabel = `${
                isCurrent ? "Current step: " : isCompleted ? "Completed step: " : "Step: "
              }${step.label}`;

              return (
                <li
                  key={step.id}
                  className={gapClassName}
                  role="listitem"
                  style={{ display: "flex", alignItems: "center", gap: 16 }}
                >
                  <button
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={ariaLabel}
                    onClick={onStepClick ? () => onStepClick(index, step) : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: "transparent",
                      border: 0,
                      cursor: onStepClick ? "pointer" : "default",
                    }}
                    data-testid={`timeline-step-${step.id}`}
                  >
                    <span
                      aria-hidden={true}
                      style={{ position: "relative", width: 18, height: 18, display: "grid", placeItems: "center" }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: 9999, ...dotStyle }} />
                      {showCompletedTick && (
                        <svg
                          viewBox="0 0 16 16"
                          width={12}
                          height={12}
                          aria-hidden={true}
                          style={{ position: "absolute", pointerEvents: "none" }}
                        >
                          <polyline
                            points="3,8 7,12 13,4.5"
                            fill="none"
                            stroke={TOKENS.tickPurple}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span style={labelStyle}>{step.label}</span>
                  </button>

                  {index < items.length - 1 && (
                    <span aria-hidden={true} style={{ width: connectorMin, height: 1, background: TOKENS.border }} />
                  )}
                </li>
              );
            })}
          </ol>

          {/* local focus ring tokens */}
          <style>{`
            :root {
              --palette-primary: ${TOKENS.primary};
              --palette-primary-light: ${TOKENS.primaryLight};
              --palette-primary-dark: ${TOKENS.primaryDark};
              --palette-secondary: ${TOKENS.secondary};
              --palette-text: ${TOKENS.text};
              --palette-border: ${TOKENS.border};
            }
            button[aria-current="step"]:focus-visible,
            button[aria-current="step"]:focus,
            button:focus-visible {
              box-shadow: 0 0 0 3px ${TOKENS.primaryLight};
              border-radius: 10px;
              outline: none;
            }
          `}</style>
        </nav>
      </div>
    </div>
  );
}

/***** PAGE: Shippers selection *****/

const fonts = "'Fractul', 'DM Sans', 'Helvetica Neue', Arial, sans-serif";

const DEFAULT_BRANCH_FILTER_META: LogisticsPartnerFilterMeta = {
  branchFilterApplied: false,
  branchNetworkCount: 0,
  filteredOutBranches: [],
  branchNetworkAuthError: false,
  branchNetworkErrorMessage: null,
};

function buildShipperDisplayName(record: LogisticsPartnerBranchRecord): string {
  const companyName =
    record.branchNetwork?.companyName ??
    record.company?.name ??
    record.partner.name ??
    "Unknown shipper";

  const candidateNames = [
    record.branchNetwork?.displayName,
    record.branchNetwork?.branchName,
    record.branch?.branch_name,
    record.branch?.name,
  ].filter((value): value is string => Boolean(value));

  const normalizedCompany = companyName.toLowerCase();
  const locationName = candidateNames.find(
    (name) => name && name.toLowerCase() !== normalizedCompany
  );

  if (locationName) {
    return `${companyName} — ${locationName}`;
  }

  return companyName;
}

export function describeBranchRecord(record: LogisticsPartnerBranchRecord): string {
  return buildShipperDisplayName(record);
}

type ShipperBranchOption = {
  id: string;
  label: string;
  subtitle: string | null;
  shipper: Shipper;
};

type OrganizationGroup = {
  id: string;
  name: string;
  logoUrl: string | null;
  partnerId: string;
  branches: ShipperBranchOption[];
};

function deriveBranchSubtitle(shipper: Shipper): string | null {
  if (!shipper.displayName) {
    return shipper.branchName && shipper.branchName !== shipper.companyName
      ? shipper.branchName
      : null;
  }

  const parts = shipper.displayName.split(" — ");
  if (parts.length <= 1) {
    return shipper.branchName && shipper.branchName !== shipper.companyName
      ? shipper.branchName
      : null;
  }

  const candidate = parts.slice(1).join(" — ").trim();
  if (!candidate) {
    return shipper.branchName && shipper.branchName !== shipper.companyName
      ? shipper.branchName
      : null;
  }

  return candidate;
}

export function mapRecordToShipper(record: LogisticsPartnerBranchRecord): Shipper {
  const { partner, branch, company, branchNetwork } = record;
  const companyName =
    branchNetwork?.companyName ??
    company?.name ??
    partner.name ??
    "Unknown shipper";
  const displayName = buildShipperDisplayName(record);
  const derivedBranchLabel =
    branchNetwork?.branchName ?? branch.branch_name ?? branch.name ?? null;
  const branchLabel =
    derivedBranchLabel ??
    (displayName.includes(" — ")
      ? displayName.split(" — ").slice(1).join(" — ")
      : displayName);
  const abbreviation = partner.abbreviation ?? null;
  const normalizedCompanyName = companyName?.trim() ?? null;
  const logoAssetUrl =
    findOrganizationLogoUrl(normalizedCompanyName) ??
    findOrganizationLogoUrl(branchNetwork?.companyName) ??
    findOrganizationLogoUrl(partner.name) ??
    findOrganizationLogoUrl(branch?.branch_name) ??
    findOrganizationLogoUrl(displayName);
  const logoUrl =
    logoAssetUrl ??
    branchNetwork?.logoUrl ??
    (abbreviation ? `/shippers/${abbreviation.toLowerCase()}.png` : null);
  const companyOrgId =
    branchNetwork?.companyOrgId ?? partner.org_id ?? company?.id ?? null;

  return {
    logisticsPartnerId: partner.id,
    branchOrgId: branch.id,
    companyOrgId,
    companyName,
    branchName: branchLabel,
    displayName,
    abbreviation,
    logoUrl,
    brandColor: partner.brand_color ?? null,
  };
}

function groupShippersByOrganization(shippers: Shipper[]): OrganizationGroup[] {
  const map = new Map<string, OrganizationGroup>();

  shippers.forEach((shipper) => {
    const key = shipper.companyOrgId ?? `partner-${shipper.logisticsPartnerId}`;
    let group = map.get(key);

    if (!group) {
      group = {
        id: key,
        name: shipper.companyName,
        logoUrl: shipper.logoUrl ?? null,
        partnerId: shipper.logisticsPartnerId,
        branches: [],
      };
      map.set(key, group);
    } else if (!group.logoUrl && shipper.logoUrl) {
      group.logoUrl = shipper.logoUrl;
    }

    group.branches.push({
      id: shipper.branchOrgId,
      label: shipper.branchName || shipper.displayName,
      subtitle: deriveBranchSubtitle(shipper),
      shipper,
    });
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      branches: group.branches.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function Monogram({ text, size = 40 }: { text: string; size?: number }) {
  const initials = text
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        display: "grid",
        placeItems: "center",
        background: "#F5EBFD",
        color: TOKENS.primary,
        fontWeight: 700,
        fontSize: size * 0.38,
        letterSpacing: -0.5,
      }}
    >
      {initials}
    </div>
  );
}

type TriState = boolean | "indeterminate";
function TriStateCheckbox({
  state,
  onChange,
  label,
  size = 18,
}: {
  state: TriState;
  onChange: (next: boolean) => void;
  label: string;
  size?: number;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={state === true}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        style={{
          width: size,
          height: size,
          accentColor: TOKENS.secondary,
          cursor: "pointer",
        }}
      />
    </label>
  );
}

function Tag({ children, tone = "purple" }: { children: React.ReactNode; tone?: "purple" | "teal" }) {
  const isPurple = tone === "purple";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 100,
        border: `1.5px solid ${isPurple ? TOKENS.primary : TOKENS.secondary}`,
        color: isPurple ? TOKENS.primary : TOKENS.secondary,
        background: "#FFFFFF",
      }}
    >
      {children}
    </span>
  );
}

function OrganizationCard({
  org,
  selectedBranchIds,
  onToggleOrg,
  onToggleBranch,
}: {
  org: OrganizationGroup;
  selectedBranchIds: Set<string>;
  onToggleOrg: (org: OrganizationGroup, nextChecked: boolean) => void;
  onToggleBranch: (branch: ShipperBranchOption, nextChecked: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const total = org.branches.length;
  const selectedCount = org.branches.filter((b) => selectedBranchIds.has(b.id)).length;
  const triState: TriState =
    selectedCount === 0 ? false : selectedCount === total ? true : "indeterminate";

  return (
    <section
      aria-label={`${org.name} organization`}
      style={{
        border: "1px solid #E9EAEB",
        borderRadius: 12,
        background: "#FFFFFF",
        padding: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {org.logoUrl ? (
            <img src={org.logoUrl} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: "cover", background: "#FFF" }} />
          ) : (
            <Monogram text={org.name} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 600,
                  color: "#170849",
                  fontSize: 16,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={org.name}
              >
                {org.name}
              </span>
              <Tag tone="teal">{total} branches</Tag>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: "rgba(23, 8, 73, 0.7)", fontSize: 12 }}>Select branches below</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TriStateCheckbox
            state={triState}
            onChange={(next) => onToggleOrg(org, next)}
            label={`Select ${org.name} (all branches)`}
          />
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={{
              border: 0,
              background: "#F5EBFD",
              color: TOKENS.primary,
              borderRadius: 8,
              padding: "8px 10px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontWeight: 600 }}>{open ? "Hide" : "Show"} branches</span>
            <motion.svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            >
              <path d="M6 9l6 6 6-6" fill="none" stroke={TOKENS.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </button>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="branch-panel"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={branchAccordionVariants}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            style={{
              overflow: "hidden",
              borderTopStyle: "solid",
              borderTopWidth: 1,
              borderTopColor: "rgba(233,234,235,0)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {org.branches.map((branch) => {
                const checked = selectedBranchIds.has(branch.id);
                return (
                  <label
                    key={branch.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      border: "1px solid #E9EAEB",
                      borderRadius: 10,
                      background: "#FFFFFF",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggleBranch(branch, e.target.checked)}
                      aria-label={`Select ${org.name} — ${branch.label}`}
                      style={{ width: 16, height: 16, accentColor: TOKENS.secondary, cursor: "pointer" }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "#170849",
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={branch.label}
                        >
                          {branch.label}
                        </span>
                      </div>
                      {branch.subtitle ? (
                        <span style={{ color: "rgba(23, 8, 73, 0.7)", fontSize: 12 }}>
                          {branch.subtitle}
                        </span>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

const ghostButton: React.CSSProperties = {
  border: "1px solid #E9EAEB",
  background: "#FFFFFF",
  color: "#170849",
  padding: "8px 12px",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: fonts,
  fontSize: 14,
};

const chipCloseBtn: React.CSSProperties = {
  border: 0,
  background: TOKENS.lavender,
  color: TOKENS.primary,
  width: 20,
  height: 20,
  lineHeight: "20px",
  textAlign: "center",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 700,
  padding: 0,
};

const branchAccordionVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    marginTop: 0,
    paddingTop: 0,
    borderTopColor: "rgba(233,234,235,0)",
  },
  expanded: {
    height: "auto",
    opacity: 1,
    marginTop: 14,
    paddingTop: 12,
    borderTopColor: "#E9EAEB",
  },
};

type DateRangeUpdate = {
  startDate?: string | null;
  endDate?: string | null;
};

type DeadlineAndArrivalSectionProps = {
  arrivalDate: string;
  targetDateStart?: string;
  targetDateEnd?: string;
  biddingDeadline: string | null;
  autoCloseBidding: boolean;
  onArrivalDateChange: (value: string) => void;
  onDateRangeChange: (range: DateRangeUpdate | null) => void;
  onBiddingDeadlineChange: (iso: string | null) => void;
};

function DeadlineAndArrivalSection({
  arrivalDate,
  targetDateStart,
  targetDateEnd,
  biddingDeadline,
  autoCloseBidding,
  onArrivalDateChange,
  onDateRangeChange,
  onBiddingDeadlineChange,
}: DeadlineAndArrivalSectionProps) {
  const [mode, setMode] = React.useState<"single" | "range">(() =>
    (targetDateStart && targetDateStart.trim() !== "") ||
    (targetDateEnd && targetDateEnd.trim() !== "")
      ? "range"
      : "single"
  );
  const [singleDate, setSingleDate] = React.useState(arrivalDate || "");
  const [rangeStart, setRangeStart] = React.useState(targetDateStart || "");
  const [rangeEnd, setRangeEnd] = React.useState(targetDateEnd || "");
  const [deadlineValue, setDeadlineValue] = React.useState(
    toLocalDateTimeValue(biddingDeadline)
  );
  const [deadlineError, setDeadlineError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      (targetDateStart && targetDateStart.trim() !== "") ||
      (targetDateEnd && targetDateEnd.trim() !== "")
    ) {
      setMode("range");
    }
  }, [targetDateEnd, targetDateStart]);

  React.useEffect(() => {
    setSingleDate(arrivalDate || "");
  }, [arrivalDate]);

  React.useEffect(() => {
    setRangeStart(targetDateStart || "");
  }, [targetDateStart]);

  React.useEffect(() => {
    setRangeEnd(targetDateEnd || "");
  }, [targetDateEnd]);

  React.useEffect(() => {
    setDeadlineValue(toLocalDateTimeValue(biddingDeadline));
  }, [biddingDeadline]);

  const minDeadlineDate = getMinDeadlineDate();
  const minDeadlineMs = minDeadlineDate.getTime();

  const arrivalAnchor =
    mode === "range" ? rangeStart || rangeEnd || "" : singleDate;

  const arrivalStartDate = React.useMemo(() => {
    const parsed = parseDateSafe(arrivalAnchor);
    if (!parsed) {
      return null;
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }, [arrivalAnchor]);

  const latestAllowedDeadline = React.useMemo(() => {
    if (!arrivalStartDate) {
      return null;
    }
    return new Date(arrivalStartDate.getTime() - 2 * DAY_MS);
  }, [arrivalStartDate]);

  const latestAllowedMs = latestAllowedDeadline
    ? latestAllowedDeadline.getTime()
    : null;

  const noAvailableWindow = Boolean(
    arrivalStartDate &&
      latestAllowedDeadline &&
      latestAllowedDeadline.getTime() < minDeadlineMs
  );

  const recommendedFromArrival = React.useMemo(() => {
    if (!arrivalStartDate) {
      return null;
    }
    const recommended = new Date(arrivalStartDate.getTime() - 5 * DAY_MS);
    recommended.setHours(DEFAULT_DEADLINE_HOUR, 0, 0, 0);
    if (recommended.getTime() <= minDeadlineMs) {
      return null;
    }
    return recommended;
  }, [arrivalStartDate, minDeadlineMs]);

  const fallbackDefaultDeadline = React.useMemo(() => {
    const defaultDeadline = computeDefaultDeadline();
    if (defaultDeadline.getTime() <= minDeadlineMs) {
      const minDate = new Date(minDeadlineMs);
      minDate.setSeconds(0, 0);
      return minDate;
    }
    return defaultDeadline;
  }, [minDeadlineMs]);

  const recommendedDeadline = noAvailableWindow
    ? null
    : recommendedFromArrival ?? fallbackDefaultDeadline;

  const recommendedDeadlineIso = recommendedDeadline
    ? recommendedDeadline.toISOString()
    : null;
  const usingArrivalBasedRecommendation = Boolean(recommendedFromArrival);
  const recommendedDeadlineText = recommendedDeadline
    ? formatDateTimeForDisplay(recommendedDeadline)
    : null;

  const deadlineInputMin = toLocalDateTimeValue(minDeadlineDate.toISOString());
  const deadlineInputMax =
    latestAllowedDeadline && !noAvailableWindow
      ? toLocalDateTimeValue(latestAllowedDeadline.toISOString())
      : undefined;

  React.useEffect(() => {
    if (noAvailableWindow) {
      setDeadlineError(
        "Arrival is less than two days away. Adjust the arrival date to enable estimate deadlines."
      );
      return;
    }
    const isoValue = fromLocalDateTimeValue(deadlineValue);
    const validationError = evaluateDeadline(isoValue, minDeadlineMs, latestAllowedMs);
    setDeadlineError(validationError);
  }, [deadlineValue, latestAllowedMs, minDeadlineMs, noAvailableWindow]);

  const isDeadlineDisabled = !autoCloseBidding || noAvailableWindow;
  const canUseRecommendedDeadline =
    Boolean(recommendedDeadlineIso) && !isDeadlineDisabled;

  React.useEffect(() => {
    if (
      isDeadlineDisabled ||
      Boolean(biddingDeadline) ||
      !recommendedDeadlineIso
    ) {
      return;
    }
    onBiddingDeadlineChange(recommendedDeadlineIso);
  }, [
    biddingDeadline,
    isDeadlineDisabled,
    onBiddingDeadlineChange,
    recommendedDeadlineIso,
  ]);

  const helperMessage = deadlineError
    ? deadlineError
    : recommendedDeadlineText
    ? `Recommended deadline: ${recommendedDeadlineText}${
        usingArrivalBasedRecommendation
          ? " (five days before arrival)."
          : " (one week from today)."
      }`
    : "Set an estimate deadline to automatically close shipper access.";

  const handleSelectSpecificDate = () => {
    if (mode === "single") {
      return;
    }
    setMode("single");
    setRangeStart("");
    setRangeEnd("");
    onDateRangeChange(null);
  };

  const handleSelectRange = () => {
    if (mode === "range") {
      return;
    }
    const fallback = singleDate || "";
    const nextStart = rangeStart || fallback;
    const nextEnd = rangeEnd || fallback;
    setMode("range");
    setRangeStart(nextStart);
    setRangeEnd(nextEnd);
    onDateRangeChange({
      startDate: nextStart || undefined,
      endDate: nextEnd || undefined,
    });
  };

  const handleSingleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSingleDate(value);
    onArrivalDateChange(value);
    if (mode === "single") {
      onDateRangeChange(null);
    }
  };

  const handleRangeStartChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setRangeStart(value);
    onDateRangeChange({ startDate: value, endDate: rangeEnd });
  };

  const handleRangeEndChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setRangeEnd(value);
    onDateRangeChange({ startDate: rangeStart, endDate: value });
  };

  const handleDeadlineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setDeadlineValue(value);
    onBiddingDeadlineChange(fromLocalDateTimeValue(value));
  };

  const handleUseRecommendedDeadline = () => {
    if (!recommendedDeadlineIso || !canUseRecommendedDeadline) {
      return;
    }
    const nextValue = toLocalDateTimeValue(recommendedDeadlineIso);
    setDeadlineValue(nextValue);
    onBiddingDeadlineChange(recommendedDeadlineIso);
    setDeadlineError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3
        style={{
          margin: 0,
          fontSize: 18,
          lineHeight: "22px",
          fontWeight: 600,
          color: "#170849",
        }}
      >
        Estimates Required By and Shipment Arrival Required By
      </h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          borderRadius: 12,
          border: "1px solid #CCDFDF",
          background: "#FFFFFF",
          padding: "16px 18px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <label style={{ fontWeight: 600, fontSize: 14, color: "#170849" }}>
              Arrival Date
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={handleSelectSpecificDate}
                variant={mode === "single" ? "contained" : "outlined"}
                size="small"
                sx={{
                  background: mode === "single" ? "#8412FF" : "transparent",
                  color: mode === "single" ? "#EAD9F9" : "#8412FF",
                  borderColor: "#8412FF",
                  borderRadius: "10px",
                  textTransform: "none",
                  fontSize: "12px",
                  fontWeight: 500,
                  padding: "4px 12px",
                  minWidth: "auto",
                  "&:hover": {
                    background:
                      mode === "single"
                        ? "#730ADD"
                        : "rgba(132, 18, 255, 0.04)",
                    borderColor: "#730ADD",
                  },
                }}
              >
                Specific Date
              </Button>
              <Button
                onClick={handleSelectRange}
                variant={mode === "range" ? "contained" : "outlined"}
                size="small"
                sx={{
                  background: mode === "range" ? "#8412FF" : "transparent",
                  color: mode === "range" ? "#EAD9F9" : "#8412FF",
                  borderColor: "#8412FF",
                  borderRadius: "10px",
                  textTransform: "none",
                  fontSize: "12px",
                  fontWeight: 500,
                  padding: "4px 12px",
                  minWidth: "auto",
                  "&:hover": {
                    background:
                      mode === "range"
                        ? "#730ADD"
                        : "rgba(132, 18, 255, 0.04)",
                    borderColor: "#730ADD",
                  },
                }}
              >
                Date Range
              </Button>
            </div>
          </div>
          {mode === "single" ? (
            <input
              type="date"
              value={singleDate}
              onChange={handleSingleDateChange}
              style={{
                border: "1px solid #E9EAEB",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 14,
                fontFamily: "inherit",
                color: "#170849",
              }}
              placeholder="Select a date"
            />
          ) : (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "rgba(23, 8, 73, 0.6)" }}>
                  From
                </span>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={handleRangeStartChange}
                  style={{
                    border: "1px solid #E9EAEB",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "#170849",
                  }}
                  placeholder="Start date"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "rgba(23, 8, 73, 0.6)" }}>
                  To
                </span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={handleRangeEndChange}
                  min={rangeStart || undefined}
                  style={{
                    border: "1px solid #E9EAEB",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "#170849",
                  }}
                  placeholder="End date"
                />
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14, color: "#170849" }}>
            Estimate deadline (local time)
          </label>
          <input
            type="datetime-local"
            value={deadlineValue}
            onChange={handleDeadlineChange}
            min={deadlineInputMin}
            max={deadlineInputMax}
            disabled={isDeadlineDisabled}
            style={{
              border: `1px solid ${deadlineError ? "#d14343" : "#E9EAEB"}`,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "inherit",
              background: isDeadlineDisabled ? "#F5F5F5" : "#FFFFFF",
              color: isDeadlineDisabled ? "#8A84A7" : "#170849",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 12,
                color: deadlineError ? "#d14343" : "rgba(23, 8, 73, 0.6)",
              }}
            >
              {helperMessage}
            </span>
            <Button
              variant="text"
              size="small"
              onClick={handleUseRecommendedDeadline}
              disabled={!canUseRecommendedDeadline}
              sx={{
                alignSelf: "flex-start",
                padding: 0,
                minWidth: "auto",
                textTransform: "none",
                fontSize: 12,
                color: canUseRecommendedDeadline ? "#8412FF" : "rgba(23, 8, 73, 0.4)",
                "&:hover": {
                  background: "transparent",
                  textDecoration: canUseRecommendedDeadline ? "underline" : "none",
                },
              }}
            >
              Use recommended deadline
            </Button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(23, 8, 73, 0.6)" }}>
          The deadline for sending estimates will close automatically at the selected time. Arrival dates help confirm shipper availability.
        </p>
      </div>
    </div>
  );
}

function getMinDeadlineDate(): Date {
  const baseline = new Date();
  baseline.setSeconds(0, 0);
  baseline.setMilliseconds(0);
  return new Date(baseline.getTime() + HOUR_MS);
}

function parseDateSafe(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLocalDateTimeValue(isoValue: string | null): string {
  if (!isoValue) {
    return "";
  }
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromLocalDateTimeValue(localValue: string | null): string | null {
  if (!localValue) {
    return null;
  }
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function formatDateTimeForDisplay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function evaluateDeadline(
  deadlineIso: string | null,
  minMs: number,
  maxMs: number | null
): string | null {
  if (!deadlineIso) {
    return null;
  }
  const millis = new Date(deadlineIso).getTime();
  if (Number.isNaN(millis)) {
    return "Enter a valid estimate deadline.";
  }
  if (millis < minMs) {
    return "Deadline must be at least one hour from now.";
  }
  if (maxMs !== null && millis > maxMs) {
    return "Deadline must be at least two full days before the arrival date.";
  }
  return null;
}

type ShippersStepProps = {
  onBack: () => void;
  onNext?: () => void;
};

const SHIPPERS_STEP_INDEX = (() => {
  const index = DEFAULT_STEPS.findIndex((step) => step.id === "shippers");
  return index >= 0 ? index : 4;
})();

export default function ShippersStep({ onBack, onNext }: ShippersStepProps) {
  const { shipmentForm, updateShipmentForm, updateDates, updateBiddingDeadline } =
    useShipmentForm();

  const [availableShippers, setAvailableShippers] = React.useState<Shipper[]>([]);
  const [branchMeta, setBranchMeta] =
    React.useState<LogisticsPartnerFilterMeta>(DEFAULT_BRANCH_FILTER_META);
  const [filteredSelectionLabels, setFilteredSelectionLabels] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const didInitRef = React.useRef(false);

  React.useEffect(() => {
    if (didInitRef.current) {
      return;
    }
    didInitRef.current = true;

    let cancelled = false;

    const loadShippers = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await LogisticsPartnerService.getLogisticsPartners();
        if (cancelled) {
          return;
        }

        setBranchMeta(result.meta ?? DEFAULT_BRANCH_FILTER_META);

        if (result.error) {
          console.error("LogisticsPartnerService.getLogisticsPartners error:", result.error);
          setError("We couldn’t load your shippers. Please try again in a moment.");
        }

        const records = result.data ?? [];
        const mapped = records.map(mapRecordToShipper);
        setAvailableShippers(mapped);

        const branchIdSet = new Set(mapped.map((shipper) => shipper.branchOrgId));
        let effectiveSelected = new Set<string>(Array.from(shipmentForm.selectedShippers));
        let effectiveContexts = new Map<string, SelectedShipperContext>(
          shipmentForm.selectedShipperContexts ?? new Map()
        );
        let selectionMutated = false;
        let contextMutated = false;

        mapped.forEach((shipper) => {
          const branchId = shipper.branchOrgId;
          const partnerId = shipper.logisticsPartnerId;

          if (effectiveSelected.has(partnerId) && !effectiveSelected.has(branchId)) {
            effectiveSelected.delete(partnerId);
            effectiveSelected.add(branchId);
            selectionMutated = true;
          }

          if (effectiveContexts.has(partnerId)) {
            const legacyContext = effectiveContexts.get(partnerId)!;
            effectiveContexts.delete(partnerId);
            effectiveContexts.set(branchId, {
              logisticsPartnerId: shipper.logisticsPartnerId,
              branchOrgId,
              companyOrgId: shipper.companyOrgId,
            });
            contextMutated = true;
          }

          if (effectiveSelected.has(branchId) && !effectiveContexts.has(branchId)) {
            effectiveContexts.set(branchId, {
              logisticsPartnerId: shipper.logisticsPartnerId,
              branchOrgId,
              companyOrgId: shipper.companyOrgId,
            });
            contextMutated = true;
          }
        });

        const hiddenSelections = Array.from(effectiveSelected).filter(
          (id) => !branchIdSet.has(id)
        );
        if (hiddenSelections.length > 0) {
          const filteredOutRecords = result.meta?.filteredOutBranches ?? [];
          const labels = hiddenSelections
            .map((id) => {
              const record = filteredOutRecords.find((entry) => entry.branch.id === id);
              if (record) {
                return describeBranchRecord(record);
              }
              const context =
                effectiveContexts.get(id) ?? shipmentForm.selectedShipperContexts?.get(id);
              if (context) {
                return context.branchOrgId;
              }
              return id;
            })
            .filter((value): value is string => Boolean(value));
          setFilteredSelectionLabels(Array.from(new Set(labels)));
        } else {
          setFilteredSelectionLabels([]);
        }

        if (selectionMutated || contextMutated) {
          updateShipmentForm({
            selectedShippers: effectiveSelected,
            selectedShipperContexts: effectiveContexts,
          });
        }
      } catch (untypedError) {
        console.error("Error loading shippers:", untypedError);
        if (!cancelled) {
          setError("We couldn’t load your shippers. Please try again in a moment.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadShippers();

    return () => {
      cancelled = true;
    };
  }, [shipmentForm.selectedShipperContexts, shipmentForm.selectedShippers, updateShipmentForm]);

  const organizations = React.useMemo(
    () => groupShippersByOrganization(availableShippers),
    [availableShippers]
  );

  const visible = React.useMemo(() => {
    if (!query.trim()) {
      return organizations;
    }
    const q = query.toLowerCase();
    return organizations
      .map((org) => ({
        ...org,
        branches: org.branches.filter(
          (branch) =>
            org.name.toLowerCase().includes(q) ||
            branch.label.toLowerCase().includes(q) ||
            (branch.subtitle ?? "").toLowerCase().includes(q)
        ),
      }))
      .filter((org) => org.branches.length > 0 || org.name.toLowerCase().includes(q));
  }, [organizations, query]);

  const selectedBranchIds = shipmentForm.selectedShippers;
  const selectedCount = selectedBranchIds.size;

  const selectedBranches = React.useMemo(
    () =>
      availableShippers.filter((shipper) =>
        selectedBranchIds.has(shipper.branchOrgId)
      ),
    [availableShippers, selectedBranchIds]
  );

  const handleArrivalDateChange = React.useCallback(
    (nextDate: string) => {
      updateDates(nextDate, shipmentForm.targetDateStart, shipmentForm.targetDateEnd);
    },
    [shipmentForm.targetDateEnd, shipmentForm.targetDateStart, updateDates]
  );

  const handleDateRangeChange = React.useCallback(
    (range: { startDate?: string | null; endDate?: string | null } | null) => {
      if (!range) {
        updateDates(shipmentForm.arrivalDate, undefined, undefined);
        return;
      }

      const normalizedStart =
        range.startDate && range.startDate.trim() !== "" ? range.startDate : undefined;
      const normalizedEnd =
        range.endDate && range.endDate.trim() !== "" ? range.endDate : undefined;
      const fallbackArrival =
        shipmentForm.arrivalDate && shipmentForm.arrivalDate.trim() !== ""
          ? shipmentForm.arrivalDate
          : normalizedStart ?? "";

      updateDates(fallbackArrival, normalizedStart, normalizedEnd);
    },
    [shipmentForm.arrivalDate, updateDates]
  );

  const updateSelection = React.useCallback(
    (
      mutate: (
        selected: Set<string>,
        contexts: Map<string, SelectedShipperContext>
      ) => void
    ) => {
      const nextSelected = new Set<string>(Array.from(selectedBranchIds));
      const existingContexts =
        shipmentForm.selectedShipperContexts ?? new Map<string, SelectedShipperContext>();
      const nextContexts = new Map<string, SelectedShipperContext>(existingContexts);
      mutate(nextSelected, nextContexts);
      updateShipmentForm({
        selectedShippers: nextSelected,
        selectedShipperContexts: nextContexts,
      });
    },
    [selectedBranchIds, shipmentForm.selectedShipperContexts, updateShipmentForm]
  );

  const handleToggleOrg = React.useCallback(
    (org: OrganizationGroup, nextChecked: boolean) => {
      updateSelection((nextSelected, nextContexts) => {
        org.branches.forEach((branch) => {
          if (nextChecked) {
            nextSelected.add(branch.id);
            nextContexts.set(branch.id, {
              logisticsPartnerId: branch.shipper.logisticsPartnerId,
              branchOrgId: branch.id,
              companyOrgId: branch.shipper.companyOrgId,
            });
          } else {
            nextSelected.delete(branch.id);
            nextContexts.delete(branch.id);
          }
        });
      });
    },
    [updateSelection]
  );

  const handleToggleBranch = React.useCallback(
    (branch: ShipperBranchOption, nextChecked: boolean) => {
      updateSelection((nextSelected, nextContexts) => {
        if (nextChecked) {
          nextSelected.add(branch.id);
          nextContexts.set(branch.id, {
            logisticsPartnerId: branch.shipper.logisticsPartnerId,
            branchOrgId: branch.id,
            companyOrgId: branch.shipper.companyOrgId,
          });
        } else {
          nextSelected.delete(branch.id);
          nextContexts.delete(branch.id);
        }
      });
    },
    [updateSelection]
  );

  const handleSelectAllVisible = React.useCallback(() => {
    if (visible.length === 0) {
      return;
    }
    updateSelection((nextSelected, nextContexts) => {
      visible.forEach((org) => {
        org.branches.forEach((branch) => {
          nextSelected.add(branch.id);
          nextContexts.set(branch.id, {
            logisticsPartnerId: branch.shipper.logisticsPartnerId,
            branchOrgId: branch.id,
            companyOrgId: branch.shipper.companyOrgId,
          });
        });
      });
    });
  }, [updateSelection, visible]);

  const handleClearAll = React.useCallback(() => {
    if (selectedCount === 0 && filteredSelectionLabels.length === 0) {
      return;
    }
    updateShipmentForm({
      selectedShippers: new Set<string>(),
      selectedShipperContexts: new Map<string, SelectedShipperContext>(),
    });
    setFilteredSelectionLabels([]);
  }, [filteredSelectionLabels.length, selectedCount, updateShipmentForm]);

  const handleRemoveSelection = React.useCallback(
    (shipper: Shipper) => {
      updateSelection((nextSelected, nextContexts) => {
        nextSelected.delete(shipper.branchOrgId);
        nextContexts.delete(shipper.branchOrgId);
      });
      setFilteredSelectionLabels((prev) =>
        prev.filter((label) => {
          const normalized = [
            shipper.branchOrgId,
            shipper.displayName,
            shipper.branchName,
          ].filter(Boolean) as string[];
          return !normalized.includes(label);
        })
      );
    },
    [updateSelection]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "DM Sans, Helvetica Neue, Arial, sans-serif",
        color: "#170849",
        width: "1256px", // FIX
        margin: "0 auto",
      }}
    >
      {/* Single large panel for shipper selection */}
      <div
        style={{
          background: "#F0FAFA",
          borderRadius: 12,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 480,
        }}
      >
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: "28px",
              letterSpacing: "-0.02em",
              fontWeight: 600,
              color: "#170849",
            }}
          >
            Select shippers
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleSelectAllVisible}
              style={{
                ...ghostButton,
                opacity: visible.length === 0 || loading ? 0.5 : 1,
                cursor: visible.length === 0 || loading ? "not-allowed" : "pointer",
              }}
              disabled={visible.length === 0 || loading}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                ...ghostButton,
                opacity: selectedCount === 0 ? 0.5 : 1,
                cursor: selectedCount === 0 ? "not-allowed" : "pointer",
              }}
              disabled={selectedCount === 0}
            >
              Clear
            </button>
          </div>
        </div>

        {error ? (
          <Alert severity="error" sx={{ width: "100%" }}>
            {error}
          </Alert>
        ) : null}
        {!loading && branchMeta.branchFilterApplied && availableShippers.length === 0 ? (
          <Alert severity="info" sx={{ width: "100%" }}>
            No eligible shipper branches currently have active members. Ask your shippers to sign in so
            you can notify them.
          </Alert>
        ) : null}
        {filteredSelectionLabels.length > 0 ? (
          <Alert severity="warning" sx={{ width: "100%" }}>
            We kept these previously selected branches, but they currently have no active members:
            {" "}
            {filteredSelectionLabels.join(", ")}.
          </Alert>
        ) : null}

        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#FFFFFF",
            borderRadius: 10,
            padding: "10px 12px",
            border: "1px solid #E9EAEB",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="7" fill="none" stroke="#A4A7AE" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#A4A7AE" strokeWidth="2" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search organization, city, airport code, country…"
            style={{ border: 0, outline: "none", flex: 1, fontSize: 14, color: "#170849", background: "transparent" }}
            aria-label="Search shippers"
          />
        </div>

        {/* Organization list */}
        <div
          role="list"
          aria-label="Organizations"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 12,
            paddingBottom: 8,
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 48,
              }}
            >
              <CircularProgress size={24} sx={{ color: TOKENS.primary }} />
            </div>
          ) : visible.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px dashed #CCDFDF",
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                color: "rgba(23,8,73,.7)",
              }}
            >
              No results. Try a different search term.
            </div>
          ) : (
            visible.map((org) => (
              <OrganizationCard
                key={org.id}
                org={org}
                selectedBranchIds={selectedBranchIds}
                onToggleOrg={handleToggleOrg}
                onToggleBranch={handleToggleBranch}
              />
            ))
          )}
        </div>

        {/* Sticky selection summary & actions */}
        <div
          aria-live="polite"
          style={{
            marginTop: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ color: "#58517E", fontWeight: 600, fontSize: 14 }}>
                Selected ({selectedCount})
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minHeight: 24 }}>
                {selectedCount === 0 ? (
                  <span style={{ color: "rgba(23,8,73,.7)", fontSize: 12 }}>Nothing selected yet.</span>
                ) : (
                  selectedBranches.map((shipper) => (
                    <span
                      key={shipper.branchOrgId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                        background: "#FFFFFF",
                        border: "1px solid #E9EAEB",
                        borderRadius: 100,
                        fontSize: 12,
                      }}
                      title={shipper.displayName}
                    >
                      <span style={{ color: TOKENS.primary, fontWeight: 600 }}>
                        {shipper.abbreviation
                          ? shipper.abbreviation
                          : (shipper.branchName || shipper.displayName || shipper.branchOrgId)
                              .slice(0, 3)
                              .toUpperCase()}
                      </span>
                      <span style={{ color: "#170849" }}>
                        {shipper.companyName.split(" ")[0]} • {shipper.branchName ?? shipper.displayName}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSelection(shipper)}
                        aria-label={`Remove ${shipper.companyName} ${shipper.branchName}`}
                        style={chipCloseBtn}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            <DeadlineAndArrivalSection
              arrivalDate={shipmentForm.arrivalDate}
              targetDateStart={shipmentForm.targetDateStart}
              targetDateEnd={shipmentForm.targetDateEnd}
              biddingDeadline={shipmentForm.biddingDeadline}
              autoCloseBidding={shipmentForm.autoCloseBidding}
              onArrivalDateChange={handleArrivalDateChange}
              onDateRangeChange={handleDateRangeChange}
              onBiddingDeadlineChange={updateBiddingDeadline}
            />

            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
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
                disabled={!onNext || selectedCount === 0}
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
                Next: Summary
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/***** LIGHT TESTS (non-executing by default) *****/

export function runDeriveTimelineTests() {
  const steps: TimelineStep[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
    { id: "d", label: "D" },
  ];

  const cases = [
    { current: 0, expect: ["current", "upcoming", "upcoming", "upcoming"] },
    { current: 2, expect: ["completed", "completed", "current", "upcoming"] },
    { current: 3, expect: ["completed", "completed", "completed", "current"] },
  ];

  const results = cases.map((c) => {
    const out = deriveTimeline(steps, c.current).map((x) => x.status);
    return { ...c, got: out, pass: JSON.stringify(out) === JSON.stringify(c.expect) };
  });

  return { results, allPass: results.every((r) => r.pass) };
}
