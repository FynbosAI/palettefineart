import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/supabaseClient.js';
import { setCorsHeaders } from '../src/utils/cors.js';

interface BranchLocation {
  id: string;
  name: string;
  address_full: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface MembershipRow {
  user_id: string;
  org_id: string;
  role: 'admin' | 'member' | 'viewer';
  location_id?: string | null;
  company_id?: string | null;
}

interface BranchRow {
  id: string;
  name: string;
  branch_name?: string | null;
  parent_org_id?: string | null;
  branch_location_id?: string | null;
  branch_location?: BranchLocation | BranchLocation[] | null;
  img_url?: string | null;
}

interface ProfileRow {
  id: string;
  full_name?: string | null;
}

interface BranchNetworkMember {
  userId: string;
  role: 'admin' | 'member' | 'viewer';
  fullName: string | null;
  locationId: string | null;
}

interface BranchNetworkEntry {
  branchOrgId: string;
  companyOrgId: string;
  companyName?: string | null;
  branchName?: string | null;
  displayName: string;
  location: BranchLocation | null;
  contact: {
    type: 'location' | 'member';
    name: string;
    email?: string | null;
    phone?: string | null;
    userId?: string | null;
    role?: 'admin' | 'member' | 'viewer';
  } | null;
  members: BranchNetworkMember[];
  logoUrl?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ ok: false, error: 'Missing Authorization bearer token' });
      return;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ ok: false, error: 'Invalid or expired token' });
      return;
    }

    const { data: membershipRows, error: membershipsError } = await supabaseAdmin
      .from('memberships')
      .select('user_id, org_id, role, location_id, company_id');

    if (membershipsError) {
      throw new Error(membershipsError.message || 'Failed to load memberships');
    }

    const memberships = ((membershipRows as MembershipRow[]) || []).filter(row => Boolean(row.org_id));

    if (memberships.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.status(200).json({ ok: true, data: [] });
      return;
    }

    const branchIds = Array.from(new Set(memberships.map(row => row.org_id))).filter(Boolean) as string[];

    const { data: branchRows, error: branchesError } = await supabaseAdmin
      .from('organizations')
      .select(`
        id,
        name,
        branch_name,
        parent_org_id,
        branch_location_id,
        branch_location:locations!organizations_branch_location_fk (
          id,
          name,
          address_full,
          contact_name,
          contact_email,
          contact_phone,
          latitude,
          longitude
        ),
        img_url
      `)
      .in('id', branchIds)
      .not('parent_org_id', 'is', null)
      .eq('type', 'partner');

    if (branchesError) {
      throw new Error(branchesError.message || 'Failed to load branch organizations');
    }

    const branches = ((branchRows as BranchRow[]) || []).filter(branch => Boolean(branch.parent_org_id));

    if (branches.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.status(200).json({ ok: true, data: [] });
      return;
    }

    const validBranchIds = new Set(branches.map(branch => branch.id));
    const filteredMemberships = memberships.filter(row => validBranchIds.has(row.org_id));

    if (filteredMemberships.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.status(200).json({ ok: true, data: [] });
      return;
    }

    const userIds = Array.from(new Set(filteredMemberships.map(row => row.user_id))).filter(Boolean) as string[];
    let profiles: ProfileRow[] = [];
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profilesError) {
        throw new Error(profilesError.message || 'Failed to load profiles');
      }

      profiles = (profileRows as ProfileRow[]) || [];
    }

    const profileMap = new Map<string, ProfileRow>(profiles.map(profile => [profile.id, profile]));

    const membershipByBranch = filteredMemberships.reduce<Record<string, BranchNetworkMember[]>>((acc, row) => {
      if (!acc[row.org_id]) {
        acc[row.org_id] = [];
      }
      const profile = profileMap.get(row.user_id);
      acc[row.org_id].push({
        userId: row.user_id,
        role: row.role,
        fullName: profile?.full_name ?? null,
        locationId: row.location_id ?? null,
      });
      return acc;
    }, {});

    const branchCompanyFallback = new Map<string, string>();
    filteredMemberships.forEach(row => {
      if (row.company_id && !branchCompanyFallback.has(row.org_id)) {
        branchCompanyFallback.set(row.org_id, row.company_id);
      }
    });

    const companyIds = Array.from(
      new Set(
        branches
          .map(branch => branch.parent_org_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    let companyNameMap = new Map<string, string>();
    if (companyIds.length > 0) {
      const { data: companyRows, error: companiesError } = await supabaseAdmin
        .from('organizations')
        .select('id, name')
        .in('id', companyIds);

      if (companiesError) {
        throw new Error(companiesError.message || 'Failed to load company organizations');
      }

      companyNameMap = new Map<string, string>(
        (companyRows || []).map((company: { id: string; name: string }) => [company.id, company.name])
      );
    }

    const normalizeLocation = (raw: BranchRow['branch_location']): BranchLocation | null => {
      if (!raw) {
        return null;
      }
      if (Array.isArray(raw)) {
        return raw.length > 0 ? raw[0] : null;
      }
      return raw;
    };

    const buildContact = (
      branch: BranchRow,
      members: BranchNetworkMember[],
      location: BranchLocation | null
    ): BranchNetworkEntry['contact'] => {
      const byLocation = members.find(member => member.locationId && member.locationId === branch.branch_location_id);
      const byRole = members.find(member => member.role === 'admin');
      const selectedMember = byLocation || byRole || members[0];

      if (selectedMember) {
        return {
          type: 'member',
          name: selectedMember.fullName || 'Branch contact',
          userId: selectedMember.userId,
          role: selectedMember.role,
        };
      }

      if (location && (location.contact_name || location.contact_email || location.contact_phone)) {
        return {
          type: 'location',
          name: location.contact_name || branch.branch_name || location.name || branch.name,
          email: location.contact_email ?? null,
          phone: location.contact_phone ?? null,
        };
      }

      return null;
    };

    const entries: BranchNetworkEntry[] = [];

    branches.forEach(branch => {
      const members = membershipByBranch[branch.id] || [];
      if (members.length === 0) {
        return;
      }

      const location = normalizeLocation(branch.branch_location);
      const contact = buildContact(branch, members, location);
      const companyOrgId = branch.parent_org_id || branchCompanyFallback.get(branch.id);

      if (!companyOrgId) {
        return;
      }

      entries.push({
        branchOrgId: branch.id,
        companyOrgId,
        companyName: companyNameMap.get(companyOrgId) ?? branch.name,
        branchName: branch.branch_name ?? null,
        displayName: branch.branch_name || location?.name || branch.name,
        location,
        contact,
        members,
        logoUrl: branch.img_url ?? null,
      });
    });

    const sortedEntries = entries.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

    res.setHeader('Cache-Control', 'public, max-age=30');
    res.status(200).json({ ok: true, data: sortedEntries });
  } catch (error: any) {
    console.error('[branch-network] handler failed', error);
    res.status(500).json({ ok: false, error: error?.message || 'Internal Server Error' });
  }
}
