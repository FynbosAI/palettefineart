create or replace function public.withdraw_bid(
    p_bid_id uuid,
    p_note   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare
    v_user uuid := auth.uid();
    v_partner_org uuid;
    v_old_status text;
begin
    -- Resolve the bidding organization's org_id for this bid.
    -- PATH A: bids.logistics_partner_id -> logistics_partners.id -> logistics_partners.organization_id
    -- PATH B (fallback): bids.logistics_partner_id is already an organization_id
    with resolved as (
        select
            b.id as bid_id,
            coalesce(
                (select lp.org_id              -- <-- change to lp.org_id if that's your column
                   from public.logistics_partners lp
                  where lp.id = b.logistics_partner_id),
                b.logistics_partner_id                  -- if schema already stores org_id here
            ) as partner_org_id,
            b.status as bid_status
        from public.bids b
        where b.id = p_bid_id
    )
    select partner_org_id, bid_status
      into v_partner_org, v_old_status
    from resolved;

    if v_partner_org is null then
        raise exception 'Bid % not found or partner organization not resolvable', p_bid_id;
    end if;

    -- Membership check: user must belong to the bidding organization's org_id
    if not exists (
        select 1
        from public.memberships m
        where m.user_id = v_user
          and m.org_id  = v_partner_org
    ) then
        raise exception 'Permission denied: user is not a member of the bidding organization (org_id=%)', v_partner_org;
    end if;

    -- Guard: cannot withdraw after acceptance or if already closed
    if v_old_status = 'accepted' then
        raise exception 'Cannot withdraw bid %: it has already been accepted/awarded', p_bid_id;
    end if;

    if v_old_status in ('withdrawn', 'rejected', 'cancelled_by_shipper') then
        raise exception 'Cannot withdraw bid %: it is already closed (%).', p_bid_id, v_old_status;
    end if;

    -- Update bid -> withdrawn
    update public.bids
       set status           = 'withdrawn',
           updated_at       = now(),
           last_modified_by = v_user
     where id = p_bid_id;

    -- Audit trail
    insert into public.bid_history(
        bid_id, action, old_status, new_status, user_id, notes, "timestamp"
    ) values (
        p_bid_id,
        'withdrawn',
        v_old_status,
        'withdrawn',
        v_user,
        coalesce(p_note, 'Bid withdrawn by shipper'),
        now()
    );
end;
$$;
