import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../src/supabaseClient.js'
import { setCorsHeaders } from '../src/utils/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
	setCorsHeaders(res, req.headers.origin as string, 'GET, POST, OPTIONS')

	if (req.method === 'OPTIONS') {
		res.status(200).end()
		return
	}

	if (req.method !== 'POST') {
		res.status(405).json({ error: 'Method Not Allowed' })
		return
	}

	try {
		const {
			p_shipment_id,
			p_change_type,
			p_proposal,
			p_proposed_ship_date,
			p_proposed_delivery_date,
			p_notes,
			p_new_origin_id,
			p_new_destination_id,
			p_new_requirements,
			p_new_delivery_specifics,
			p_origin_location,
			p_destination_location,
		} = (req.body || {}) as Record<string, any>

		if (!p_shipment_id) {
			res.status(400).json({ error: 'Missing p_shipment_id' })
			return
		}

		// Authorization: require Supabase bearer token
		const authHeader = String(req.headers.authorization || '')
		const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined
		if (!token) {
			res.status(401).json({ error: 'Missing Authorization bearer token' })
			return
		}

		// Optional: verify token for early 401s (DB will enforce too)
		const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token)
		if (userErr || !userRes?.user) {
			res.status(401).json({ error: 'Invalid or expired token' })
			return
		}

		const supabaseUrl = process.env.SUPABASE_URL
		const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
		if (!supabaseUrl || !supabaseAnonKey) {
			res.status(500).json({ ok: false, error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_ANON_KEY' })
			return
		}

		// Create a user-scoped client so auth.uid() is available inside the SQL function
		const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey, {
			global: { headers: { Authorization: `Bearer ${token}` } },
			auth: { persistSession: false, autoRefreshToken: false },
		})

		const { data, error } = await supabaseAsUser.rpc('create_change_request', {
			p_shipment_id,
			p_change_type,
			p_proposal,
			p_proposed_ship_date,
			p_proposed_delivery_date,
			p_notes,
			p_new_origin_id,
			p_new_destination_id,
			p_new_requirements,
			p_new_delivery_specifics,
			p_origin_location,
			p_destination_location,
		})

		if (error) {
			const anyErr: any = error as any
			res.status(400).json({
				ok: false,
				error: {
					message: anyErr?.message || String(anyErr),
					code: anyErr?.code,
					details: anyErr?.details,
					hint: anyErr?.hint,
				},
			})
			return
		}

		res.status(200).json({ ok: true, result: data })
	} catch (err: any) {
		res.status(500).json({ ok: false, error: err?.message || 'Internal Server Error' })
	}
}


