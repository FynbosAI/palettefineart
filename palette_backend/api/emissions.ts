import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCorsHeaders } from '../src/utils/cors.js'
import { XMLParser } from 'fast-xml-parser'
import { resolveAir, resolveSea, resolveTruck } from '../lib/codeResolver.js'
import { supabaseAdmin } from '../src/supabaseClient.js'

// Environment variable name for the CarbonCare API key
const CARBONCARE_API_KEY = process.env.CARBONCARE_API_KEY || ''
const DEBUG = String(process.env.CARBONCARE_DEBUG || process.env.DEBUG || '').toLowerCase() === 'true'
function debugLog(...args: any[]): void {
  if (DEBUG) console.log('[emissions]', ...args)
}

// Endpoint input types
export type Mode = 'air' | 'sea' | 'truck'

export interface AirInput {
  mode: 'air'
  weightKg: number
  originAirport: string // IATA code, e.g. LHR
  destinationAirport: string // IATA code, e.g. JFK
  airType?: 'ABA' | 'ABB' | 'ABC'
  quote?: boolean
  cooling?: boolean
}

export interface AirInputFreeText {
  mode: 'air'
  weightKg: number
  originText: string
  destinationText: string
  originCountryHint?: string
  destinationCountryHint?: string
  airType?: 'ABA' | 'ABB' | 'ABC'
  quote?: boolean
  cooling?: boolean
}

export interface SeaInput {
  mode: 'sea'
  weightKg: number
  originSeaport: string // UN/LOCODE, e.g. DEHAM
  destinationSeaport: string // UN/LOCODE, e.g. USNYC
  quote?: boolean
  cooling?: boolean
}

export interface SeaInputFreeText {
  mode: 'sea'
  weightKg: number
  originText: string
  destinationText: string
  originCountryHint?: string
  destinationCountryHint?: string
  quote?: boolean
  cooling?: boolean
}

export interface TruckInput {
  mode: 'truck'
  weightKg: number
  originPostalCode: string
  originCountry: string // ISO 3166-1 alpha-2, e.g. GB
  originCity?: string
  originStreet?: string
  destinationPostalCode: string
  destinationCountry: string // ISO 3166-1 alpha-2, e.g. US
  destinationCity?: string
  destinationStreet?: string
  truckType?: 'R3.5D' | 'R7.5D' | 'R18D'
  loadFactor?: number // 0.0 .. 1.0
  quote?: boolean
  cooling?: boolean
}

export interface TruckInputFreeText {
  mode: 'truck'
  weightKg: number
  originText: string
  destinationText: string
  originCountryHint?: string
  destinationCountryHint?: string
  originStreet?: string
  destinationStreet?: string
  truckType?: 'R3.5D' | 'R7.5D' | 'R18D'
  loadFactor?: number
  quote?: boolean
  cooling?: boolean
}

export type EmissionsRequestBody =
  | AirInput
  | AirInputFreeText
  | SeaInput
  | SeaInputFreeText
  | TruckInput
  | TruckInputFreeText

interface EmissionsResponsePayload {
  km?: number
  tkm?: number
  emissionsKg?: {
    tot: number
    ops: number
    ene: number
    totEiGrPerTkm: number
  }
  raw?: any
}

// @ts-ignore: shared types live outside palette_backend rootDir; this import is type-only.
type BidEmissionsContext = import('../../shared/emissions/types.js').BidEmissionsContext

type EmissionsRequestBodyWithContext = EmissionsRequestBody & { context?: BidEmissionsContext }

interface PersistedCalculationSummary {
  id: string
  emissions_tot: number | string | null
}

function extractNumeric(value: any): number | undefined {
  if (value == null) return undefined
  // If response uses object format like { "#text": 123, Unit: "..." }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) {
        const n = extractNumeric(item)
        if (typeof n === 'number') return n
      }
      return undefined
    }
    if ('#text' in value) {
      const n = Number((value as any)['#text'])
      return Number.isFinite(n) ? n : undefined
    }
    // Try common alternatives
    if ('value' in value) {
      const n = Number((value as any)['value'])
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

async function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function tryParseJson(text: string): any | undefined {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function parseUrlEncoded(text: string): Record<string, any> {
  const params = new URLSearchParams(text)
  const result: Record<string, any> = {}
  for (const [key, value] of params.entries()) {
    // Attempt to coerce numbers/booleans where obvious
    if (value === 'true' || value === 'false') {
      result[key] = value === 'true'
    } else if (!Number.isNaN(Number(value)) && value.trim() !== '') {
      result[key] = Number(value)
    } else {
      result[key] = value
    }
  }
  return result
}

async function parseRequestBody(req: VercelRequest): Promise<any> {
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  debugLog('content-type:', contentType || '(none)')
  debugLog('incoming body typeof:', typeof req.body, 'isBuffer:', Buffer.isBuffer(req.body))

  // If a body was already provided, normalize it
  if (typeof req.body === 'string') {
    debugLog('parsing body from provided string, length:', req.body.length)
    const asJson = tryParseJson(req.body)
    if (asJson && typeof asJson === 'object') return asJson
    if (contentType.includes('application/x-www-form-urlencoded')) {
      debugLog('detected urlencoded string body')
      return parseUrlEncoded(req.body)
    }
    // Fallback: if it looks like JSON, try anyway
    if (/^[\[{]/.test(req.body.trim())) {
      const fallback = tryParseJson(req.body)
      if (fallback) return fallback
    }
    return {}
  }

  if (Buffer.isBuffer(req.body)) {
    debugLog('parsing body from provided Buffer, length:', (req.body as Buffer).length)
    const text = req.body.toString('utf8')
    const asJson = tryParseJson(text)
    if (asJson && typeof asJson === 'object') return asJson
    if (contentType.includes('application/x-www-form-urlencoded')) {
      debugLog('detected urlencoded buffer body')
      return parseUrlEncoded(text)
    }
    if (/^[\[{]/.test(text.trim())) {
      const fallback = tryParseJson(text)
      if (fallback) return fallback
    }
    return {}
  }

  if (req.body && typeof req.body === 'object') {
    debugLog('using already parsed object body, keys:', Object.keys(req.body as object))
    return req.body
  }

  // Body not pre-parsed; read the raw stream
  debugLog('reading raw body from request stream')
  const rawText = await readRawBody(req)
  debugLog('raw body length:', rawText.length)
  if (!rawText) return {}
  if (contentType.includes('application/json')) {
    const asJson = tryParseJson(rawText)
    return asJson && typeof asJson === 'object' ? asJson : {}
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    debugLog('detected urlencoded stream body')
    return parseUrlEncoded(rawText)
  }
  // Last resort: try JSON regardless of content-type
  const asJson = tryParseJson(rawText)
  return asJson && typeof asJson === 'object' ? asJson : {}
}

function ensureEnv(): void {
  if (!CARBONCARE_API_KEY) {
    throw new Error('Missing CARBONCARE_API_KEY environment variable')
  }
}

function xmlHeader(): string {
  return '<?xml version="1.0" encoding="utf-8"?>'
}

function wrap(bodyXml: string): string {
  return (
    xmlHeader() +
    `<CarbonCareApi xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Version="3.2">` +
    `<Request>` +
    `<ApiKey>${CARBONCARE_API_KEY}</ApiKey>` +
    `<Shipments>` +
    `<Shipment Id="">` +
    `<VolumeUnit>M3</VolumeUnit>` +
    `<WeightUnit>kg</WeightUnit>` +
    bodyXml +
    `</Shipment>` +
    `</Shipments>` +
    `</Request>` +
    `</CarbonCareApi>`
  )
}

function buildAirXml(input: AirInput): string {
  const quote = input.quote ?? false
  const cooling = input.cooling ?? false
  const airType = input.airType ?? 'ABB'
  const weight = Math.max(0, Number(input.weightKg) || 0)

  const body =
    `<Weight>${weight}</Weight>` +
    `<Cooling>${String(cooling).toLowerCase()}</Cooling>` +
    `<Legs><Leg><Air>` +
    `<From><AirPortCode>${escapeXml(input.originAirport)}</AirPortCode></From>` +
    `<To><AirPortCode>${escapeXml(input.destinationAirport)}</AirPortCode></To>` +
    `<AirType>${airType}</AirType>` +
    `</Air></Leg></Legs>`

  return wrap(
    `<Quote>${String(quote).toLowerCase()}</Quote>` +
      body
  )
}

function buildSeaXml(input: SeaInput): string {
  const quote = input.quote ?? false
  const cooling = input.cooling ?? false
  const weight = Math.max(0, Number(input.weightKg) || 0)

  const body =
    `<Weight>${weight}</Weight>` +
    `<Cooling>${String(cooling).toLowerCase()}</Cooling>` +
    `<Legs><Leg><Sea>` +
    `<From><SeaPortCode>${escapeXml(input.originSeaport)}</SeaPortCode></From>` +
    `<To><SeaPortCode>${escapeXml(input.destinationSeaport)}</SeaPortCode></To>` +
    `</Sea></Leg></Legs>`

  return wrap(
    `<Quote>${String(quote).toLowerCase()}</Quote>` +
      body
  )
}

function buildTruckXml(input: TruckInput): string {
  const quote = input.quote ?? false
  const cooling = input.cooling ?? false
  const weight = Math.max(0, Number(input.weightKg) || 0)
  const truckType = input.truckType ?? 'R18D'
  const loadFactor = clamp(Number(input.loadFactor ?? 0), 0, 1)

  const fromAddress =
    `<Address>` +
    `<PostalCode>${escapeXml(input.originPostalCode)}</PostalCode>` +
    `<TwoLetterCountry>${escapeXml(input.originCountry)}</TwoLetterCountry>` +
    `<Country>${escapeXml(countryNameFromIso2(input.originCountry) || '')}</Country>` +
    `<City>${escapeXml(input.originCity || '')}</City>` +
    (input.originStreet ? `<Street>${escapeXml(input.originStreet)}</Street>` : '<Street></Street>') +
    `</Address>`

  const toAddress =
    `<Address>` +
    `<PostalCode>${escapeXml(input.destinationPostalCode)}</PostalCode>` +
    `<TwoLetterCountry>${escapeXml(input.destinationCountry)}</TwoLetterCountry>` +
    `<Country>${escapeXml(countryNameFromIso2(input.destinationCountry) || '')}</Country>` +
    `<City>${escapeXml(input.destinationCity || '')}</City>` +
    (input.destinationStreet ? `<Street>${escapeXml(input.destinationStreet)}</Street>` : '<Street></Street>') +
    `</Address>`

  const body =
    `<Weight>${weight}</Weight>` +
    `<Cooling>${String(cooling).toLowerCase()}</Cooling>` +
    `<Legs><Leg><Truck>` +
    `<From>${fromAddress}</From>` +
    `<To>${toAddress}</To>` +
    `<Type>${truckType}</Type>` +
    `<LoadFactor>${loadFactor}</LoadFactor>` +
    `</Truck></Leg></Legs>`

  return wrap(
    `<Quote>${String(quote).toLowerCase()}</Quote>` +
      body
  )
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function countryNameFromIso2(code: string | undefined): string | undefined {
  if (!code) return undefined
  try {
    // Prefer English display names; fall back to the code itself
    const dn = new (Intl as any).DisplayNames(['en'], { type: 'region' })
    const name = dn.of(code.toUpperCase())
    return name || code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

async function callCarbonCare(xmlPayload: string): Promise<EmissionsResponsePayload> {
  const response = await fetch('https://api.carboncare.ch/xml/calc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      'Accept': 'application/xml',
    },
    body: xmlPayload,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`CarbonCare API error ${response.status}: ${text}`)
  }

  const xml = await response.text()
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })
  const parsed = parser.parse(xml)

  // The response structure contains Shipments/Shipment with Emmissions, KM, TKM etc.
  // Be defensive: handle single or array
  const shipment = resolveShipment(parsed)

  if (!shipment) {
    return { raw: parsed }
  }

  const emissions = shipment.Emmissions || shipment.Emissions || {}
  const payload: EmissionsResponsePayload = {
    km: extractNumeric(shipment.KM),
    tkm: extractNumeric(emissions.TKM ?? shipment.TKM),
    emissionsKg: {
      tot: extractNumeric(emissions.TOT) ?? 0,
      ops: extractNumeric(emissions.OPS) ?? 0,
      ene: extractNumeric(emissions.ENE) ?? 0,
      totEiGrPerTkm: extractNumeric(emissions.TOT_EI) ?? 0,
    },
    raw: parsed,
  }

  return payload
}

function resolveShipment(parsed: any): any | undefined {
  const root = parsed?.CarbonCareApi || parsed
  const response = root?.Response || root
  const shipments = response?.Shipments || root?.Shipments
  const shipment = shipments?.Shipment || response?.Shipment || root?.Shipment
  if (!shipment) return undefined
  return Array.isArray(shipment) ? shipment[0] : shipment
}

function numberOrZero(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function numberOrUndefined(value: any): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function validateInitial(body: any): asserts body is { mode: Mode; weightKg: number } {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid JSON body')
  }
  if (!('mode' in body)) throw new Error('Missing mode')
  if (!('weightKg' in body)) throw new Error('Missing weightKg')
  if (typeof body.weightKg !== 'number' || !(body.weightKg > 0)) {
    throw new Error('weightKg must be a positive number')
  }
}

async function normalizeInput(body: EmissionsRequestBody): Promise<AirInput | SeaInput | TruckInput> {
  if (body.mode === 'air') {
    if ('originAirport' in body && 'destinationAirport' in body) {
      return body as AirInput
    }
    if ('originText' in body && 'destinationText' in body) {
      const resolved = await resolveAir({
        originText: body.originText,
        destinationText: body.destinationText,
        originCountryHint: (body as AirInputFreeText).originCountryHint,
        destinationCountryHint: (body as AirInputFreeText).destinationCountryHint,
        limit: 5,
      })
      return {
        mode: 'air',
        weightKg: body.weightKg,
        originAirport: resolved.originAirport,
        destinationAirport: resolved.destinationAirport,
        airType: (body as AirInputFreeText).airType,
        quote: (body as AirInputFreeText).quote,
        cooling: (body as AirInputFreeText).cooling,
      }
    }
    throw new Error('Provide either originAirport/destinationAirport or originText/destinationText for air mode')
  }

  if (body.mode === 'sea') {
    if ('originSeaport' in body && 'destinationSeaport' in body) {
      return body as SeaInput
    }
    if ('originText' in body && 'destinationText' in body) {
      const resolved = await resolveSea({
        originText: body.originText,
        destinationText: body.destinationText,
        originCountryHint: (body as SeaInputFreeText).originCountryHint,
        destinationCountryHint: (body as SeaInputFreeText).destinationCountryHint,
        limit: 5,
      })
      return {
        mode: 'sea',
        weightKg: body.weightKg,
        originSeaport: resolved.originSeaport,
        destinationSeaport: resolved.destinationSeaport,
        quote: (body as SeaInputFreeText).quote,
        cooling: (body as SeaInputFreeText).cooling,
      }
    }
    throw new Error('Provide either originSeaport/destinationSeaport or originText/destinationText for sea mode')
  }

  if (body.mode === 'truck') {
    if ('originPostalCode' in body && 'originCountry' in body && 'destinationPostalCode' in body && 'destinationCountry' in body) {
      return body as TruckInput
    }
    if ('originText' in body && 'destinationText' in body) {
      const resolved = await resolveTruck({
        originText: body.originText,
        destinationText: body.destinationText,
        originCountryHint: (body as TruckInputFreeText).originCountryHint,
        destinationCountryHint: (body as TruckInputFreeText).destinationCountryHint,
        limit: 5,
      })
      return {
        mode: 'truck',
        weightKg: body.weightKg,
        originPostalCode: resolved.originPostalCode,
        originCountry: resolved.originCountry,
        originCity: resolved.originCity || (undefined as any),
        destinationPostalCode: resolved.destinationPostalCode,
        destinationCountry: resolved.destinationCountry,
        destinationCity: resolved.destinationCity || (undefined as any),
        originStreet: (body as TruckInputFreeText).originStreet,
        destinationStreet: (body as TruckInputFreeText).destinationStreet,
        truckType: (body as TruckInputFreeText).truckType,
        loadFactor: (body as TruckInputFreeText).loadFactor,
        quote: (body as TruckInputFreeText).quote,
        cooling: (body as TruckInputFreeText).cooling,
      }
    }
    throw new Error('Provide either postal codes/countries or originText/destinationText for truck mode')
  }

  throw new Error('Unsupported mode')
}

interface PersistCalculationParams {
  normalized: AirInput | SeaInput | TruckInput
  result: EmissionsResponsePayload
  requestBody: any
  context?: BidEmissionsContext
}

async function persistCalculation({ normalized, result, requestBody, context }: PersistCalculationParams): Promise<PersistedCalculationSummary> {
  const insertPayload: Record<string, any> = {
    quote_id: context?.quoteId ?? null,
    bid_id: context?.bidId ?? null,
    distance_km: numberOrUndefined(result.km) ?? null,
    distance_unit: 'km',
    emissions_tot: numberOrUndefined(result.emissionsKg?.tot) ?? null,
    emissions_ops: numberOrUndefined(result.emissionsKg?.ops) ?? null,
    emissions_ene: numberOrUndefined(result.emissionsKg?.ene) ?? null,
    emissions_tot_ei: numberOrUndefined(result.emissionsKg?.totEiGrPerTkm) ?? null,
    emissions_tkm: numberOrUndefined(result.tkm) ?? null,
    api_request: {
      body: cloneForJson(requestBody),
      normalized: cloneForJson(normalized),
    },
    api_response: cloneForJson(result.raw ?? null),
    calculated_by: context?.calculatedByUserId ?? null,
  }

  const { data, error } = await supabaseAdmin
    .from('carbon_calculations')
    .insert(insertPayload)
    .select('id, emissions_tot')
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to persist carbon calculation')
  }

  return data as PersistedCalculationSummary
}

function cloneForJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight + headers
  setCorsHeaders(res, req.headers.origin as string, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' })
    }

    ensureEnv()

    // Parse body and ensure default weight of 20kg if not supplied or invalid
    const bodyRaw: any = await parseRequestBody(req)
    debugLog('parsed body keys:', Object.keys(bodyRaw || {}))
    debugLog('parsed body preview:', JSON.stringify(bodyRaw || {}, null, 2).slice(0, 400))

    const responseWarnings: string[] = []

    if (!(typeof bodyRaw?.weightKg === 'number' && bodyRaw.weightKg > 0)) {
      bodyRaw.weightKg = 20
      debugLog('weightKg missing/invalid, defaulting to 20')
      responseWarnings.push('weightKg missing or invalid; defaulted to 20kg for emissions request.')
    }

    const body = bodyRaw as EmissionsRequestBodyWithContext
    const context = body.context
    if (Array.isArray(context?.warnings) && context.warnings.length > 0) {
      responseWarnings.push(...context.warnings.filter(Boolean))
    }

    debugLog('validating initial body...')
    validateInitial(body)
    debugLog('initial validation passed, mode:', body.mode)

    // Normalize: resolve free-text to codes if needed
    debugLog('normalizing input for mode:', body.mode)
    const normalized = await normalizeInput(body)
    debugLog('normalized input:', JSON.stringify(normalized, null, 2))

    let xml: string
    switch (normalized.mode as Mode) {
      case 'air':
        xml = buildAirXml(normalized as AirInput)
        debugLog('built XML for air shipment')
        break
      case 'sea':
        xml = buildSeaXml(normalized as SeaInput)
        debugLog('built XML for sea shipment')
        break
      case 'truck':
        xml = buildTruckXml(normalized as TruckInput)
        debugLog('built XML for truck shipment')
        break
      default:
        throw new Error('Unsupported mode')
    }

  if (DEBUG) {
    // Redact API key, log compact XML for troubleshooting
    const redacted = xml.replace(/<ApiKey>[^<]*<\/ApiKey>/, '<ApiKey>***</ApiKey>')
    debugLog('request XML:', redacted.slice(0, 1200))
  }

    const result = await callCarbonCare(xml)
    debugLog('CarbonCare response extracted metrics:', result?.emissionsKg)

    let persisted: PersistedCalculationSummary | null = null
    if (context?.bidId || context?.quoteId) {
      persisted = await persistCalculation({
        normalized,
        result,
        requestBody: bodyRaw,
        context,
      })

      if (persisted?.id) {
        try {
          await supabaseAdmin.rpc('set_primary_carbon_calculation', { p_calculation_id: persisted.id })
        } catch (rpcError: any) {
          debugLog('set_primary_carbon_calculation failed:', rpcError?.message || rpcError)
          responseWarnings.push(`Failed to promote carbon calculation: ${rpcError?.message || String(rpcError)}`)
        }
      } else {
        responseWarnings.push('Carbon calculation persisted without identifier; skipping promotion to primary.')
      }
    } else {
      responseWarnings.push('No bid or quote context supplied; skipping carbon calculation persistence.')
    }

    const persistedValue = numberOrUndefined(persisted?.emissions_tot)
    const co2Estimate = persistedValue ?? numberOrUndefined(result.emissionsKg?.tot) ?? null
    const warnings = Array.from(new Set(responseWarnings.filter(Boolean)))

    return res.status(200).json({
      ok: true,
      mode: normalized.mode,
      inputs: normalized,
      result,
      calculationId: persisted?.id ?? null,
      co2Estimate,
      warnings,
    })
  } catch (err: any) {
    const message = err?.message || 'Unknown error'
    debugLog('handler error:', message, err?.stack || '(no stack)')
    return res.status(400).json({ ok: false, error: message })
  }
}
