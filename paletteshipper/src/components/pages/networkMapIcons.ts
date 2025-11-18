const DEFAULT_MARKER_BG = '#ffffff';

export interface ClusterMemberInfo {
  id: string;
  name: string;
  logoUrl: string;
}

export const sanitizeHtmlAttribute = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const getInitials = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }

  const parts = trimmed.split(/\s+/).slice(0, 2);
  const letters = parts
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return letters || trimmed.slice(0, 2).toUpperCase();
};

const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

export const computeJitterVector = (id: string): { x: number; y: number } => {
  const hash = Math.abs(hashString(id));
  const angle = (hash % 360) * (Math.PI / 180);
  const magnitude = 8 + (hash % 6); // between 8 and 13 px
  const x = Math.cos(angle) * magnitude;
  const y = Math.sin(angle) * magnitude;
  return { x, y };
};

const describeArc = (
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string => {
  const start = {
    x: cx + radius * Math.cos(startAngle),
    y: cy + radius * Math.sin(startAngle),
  };
  const end = {
    x: cx + radius * Math.cos(endAngle),
    y: cy + radius * Math.sin(endAngle),
  };

  const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
};

const clampSliceCount = (count: number): number => {
  if (count <= 1) {
    return 1;
  }
  if (count === 2) {
    return 2;
  }
  if (count === 3) {
    return 3;
  }
  return 4;
};

export const createLogoMarkerHtml = (
  params: {
    logoUrl: string;
    companyName: string;
    size: number;
    isSelected: boolean;
    ariaLabel: string;
    branchId: string;
  }
): string => {
  const { logoUrl, companyName, size, isSelected, ariaLabel, branchId } = params;
  const sanitizedUrl = sanitizeHtmlAttribute(logoUrl);
  const sanitizedName = sanitizeHtmlAttribute(companyName || 'Organization');
  const sanitizedAria = sanitizeHtmlAttribute(ariaLabel || companyName || 'Organization');
  const initials = sanitizeHtmlAttribute(getInitials(companyName || ''));
  const imagePadding = 0//Math.max(2, Math.round(size * 0.08));
  const fallbackFontSize = Math.max(12, Math.round((size - imagePadding * 2) * 0.45));
  const borderColor = isSelected ? '#10B981' : '#FFFFFF';
  const shadow = isSelected
    ? '0 0 0 3px rgba(16, 185, 129, 0.35), 0 8px 18px rgba(15, 23, 42, 0.22)'
    : '0 4px 14px rgba(15, 23, 42, 0.18)';

  return `
    <div
      class="logo-marker"
      role="button"
      tabindex="0"
      aria-label="${sanitizedAria}"
      data-branch-id="${sanitizeHtmlAttribute(branchId)}"
      style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${DEFAULT_MARKER_BG};
        border: 3px solid ${borderColor};
        box-shadow: ${shadow};
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease, border-color 0.2s ease;
      "
    >
      <div
        class="logo-marker-inner"
        style="
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.18s ease-out;
        "
      >
        <img
          src="${sanitizedUrl}"
          alt="${sanitizedName} logo"
          loading="lazy"
          style="
            width: 100%;
            height: 100%;
            object-fit: contain;
            padding: ${imagePadding}px;
            box-sizing: border-box;
            background: #fff;
            border-radius: 50%;
          "
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <span
          style="
            display: none;
            width: 100%;
            height: 100%;
            align-items: center;
            justify-content: center;
            font-size: ${fallbackFontSize}px;
            font-weight: 600;
            color: #111827;
            background: #E5E7EB;
            box-sizing: border-box;
            padding: ${Math.max(1, Math.round(imagePadding / 2))}px;
          "
        >${initials}</span>
      </div>
    </div>
  `;
};

export const createClusterIconHtml = (
  members: ClusterMemberInfo[],
  totalCount: number,
  size: number,
  clusterId: string
): { html: string; ariaLabel: string; tooltipText: string } => {
  const sanitizedClusterId = sanitizeHtmlAttribute(clusterId);
  const center = size / 2;
  const radius = center - 4;

  const sliceMembers = members.slice(0, totalCount > 4 ? 3 : clampSliceCount(members.length));
  const sliceCount = clampSliceCount(sliceMembers.length || 1);

  const additionalCount = totalCount - sliceMembers.length;

  const defs: string[] = [];
  const slices: string[] = [];

  sliceMembers.forEach((member, index) => {
    const startAngle = (index / sliceCount) * 2 * Math.PI - Math.PI / 2;
    const endAngle = ((index + 1) / sliceCount) * 2 * Math.PI - Math.PI / 2;
    const pathId = `${sanitizedClusterId}-path-${index}`;
    const clipId = `${sanitizedClusterId}-clip-${index}`;
    const path = describeArc(center, center, radius, startAngle, endAngle);
    defs.push(`
      <clipPath id="${clipId}">
        <path d="${path}" />
      </clipPath>
    `);
    slices.push(`
      <g clip-path="url(#${clipId})">
        <image
          href="${sanitizeHtmlAttribute(member.logoUrl)}"
          x="${center - radius}"
          y="${center - radius}"
          width="${radius * 2}"
          height="${radius * 2}"
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
    `);
  });

  const ariaLabelParts: string[] = [`Cluster of ${totalCount} organizations`];
  if (sliceMembers.length > 0) {
    const names = sliceMembers.map((member) => member.name).join(', ');
    ariaLabelParts.push(`including ${names}`);
  }
  if (additionalCount > 0) {
    ariaLabelParts.push(`and ${additionalCount} more`);
  }

  const ariaLabel = sanitizeHtmlAttribute(ariaLabelParts.join(' '));
  const tooltipText = sliceMembers
    .map((member) => member.name)
    .join(', ');

  const badgeHtml = additionalCount > 0
    ? `<div
        style="
          position: absolute;
          bottom: -2px;
          right: -2px;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          border-radius: 999px;
          background: #111827;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35);
        "
      >+${additionalCount}</div>`
    : '';

  const html = `
    <div
      class="cluster-marker"
      role="button"
      tabindex="0"
      aria-label="${ariaLabel}"
      data-cluster-id="${sanitizedClusterId}"
      style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        overflow: hidden;
        border: 4px solid #fff;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.25);
        background: ${DEFAULT_MARKER_BG};
        cursor: pointer;
        transition: transform 0.2s ease;
      "
      title="${sanitizeHtmlAttribute(tooltipText)}"
    >
      <svg
        width="${size}"
        height="${size}"
        viewBox="0 0 ${size} ${size}"
        xmlns="http://www.w3.org/2000/svg"
        style="display: block; border-radius: 50%; background: #fff;"
      >
        <defs>
          ${defs.join('')}
        </defs>
        ${slices.join('')}
      </svg>
      ${badgeHtml}
    </div>
  `;

  return { html, ariaLabel, tooltipText };
};
