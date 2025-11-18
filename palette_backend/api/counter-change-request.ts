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
		const { p_change_request_id, p_new_amount, p_notes, p_branch_org_id, line_items, remove_ids } = (req.body || {}) as {
			p_change_request_id?: string
			p_new_amount?: number
			p_notes?: string
			p_branch_org_id?: string
			line_items?: any
			remove_ids?: string[] | any
		}
		if (!p_change_request_id || typeof p_new_amount !== 'number') {
			res.status(400).json({ error: 'Missing p_change_request_id or p_new_amount' })
			return
		}
		if (!p_branch_org_id) {
			res.status(400).json({ error: 'Missing p_branch_org_id' })
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

		const normalizedLineItems = Array.isArray(line_items)
			? line_items
					.map((raw) => {
						if (!raw || typeof raw !== 'object') return null
						const id = typeof raw.id === 'string' ? raw.id : null
						return {
							id,
							category: typeof raw.category === 'string' ? raw.category : undefined,
							description: Array.isArray(raw.description) ? raw.description : undefined,
							quantity: typeof raw.quantity === 'number' ? raw.quantity : undefined,
							unit_price: typeof raw.unit_price === 'number' ? raw.unit_price : undefined,
							total_amount: typeof raw.total_amount === 'number' ? raw.total_amount : undefined,
							is_optional: typeof raw.is_optional === 'boolean' ? raw.is_optional : undefined,
							notes: typeof raw.notes === 'string' ? raw.notes : undefined,
							sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : undefined,
						}
					})
			.filter(Boolean)
			: []

		const normalizedRemoveIds = Array.isArray(remove_ids)
			? remove_ids
					.map((rid) => (typeof rid === 'string' ? rid : null))
					.filter(Boolean)
			: []

		const { data, error } = await supabaseAsUser.rpc('counter_change_request', {
			p_change_request_id,
			p_new_amount,
			p_notes,
			p_branch_org_id,
			p_line_items: normalizedLineItems,
			p_remove_ids: normalizedRemoveIds,
		})

		if (error) {
			const anyErr: any = error as any
			const status = anyErr?.code === '42501' ? 403 : 400
			res.status(status).json({
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
