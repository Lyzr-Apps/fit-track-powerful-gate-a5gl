'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FiPackage,
  FiAlertTriangle,
  FiShoppingCart,
  FiTrendingUp,
  FiSearch,
  FiSend,
  FiBell,
  FiChevronDown,
  FiChevronRight,
  FiMenu,
  FiX,
  FiBarChart2,
  FiBox,
  FiDollarSign,
  FiFilter,
  FiRefreshCw,
  FiArrowUp,
  FiArrowDown,
  FiMinus,
  FiLayout,
  FiMessageSquare,
} from 'react-icons/fi'

// ---- Constants ----
const AGENT_ID = '699d4f2141645707cdaec53a'

// ---- TypeScript Interfaces ----
interface Metrics {
  totalSKUs: number
  lowStockCount: number
  pendingOrders: number
  topSeller: string
}

interface LowStockAlert {
  product: string
  currentStock: number
  threshold: number
  status: string
  priority: string
  recommendedOrder: number
}

interface InventoryItem {
  product: string
  sku: string
  category: string
  currentStock: number
  reorderThreshold: number
  status: string
  lastRestocked: string
}

interface SalesItem {
  product: string
  unitsSold: number
  revenue: number
  trend: string
  category: string
}

interface OrderItem {
  orderId: string
  date: string
  itemCount: number
  status: string
  supplier: string
  items: { name: string; quantity: number }[]
}

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
  timestamp: Date
}

interface AgentData {
  message?: string
  metrics?: Metrics
  lowStockAlerts?: LowStockAlert[]
  inventoryItems?: InventoryItem[]
  salesData?: SalesItem[]
  orders?: OrderItem[]
}

// ---- Robust JSON parsing for agent responses ----
function tryParseJSON(val: any): any {
  if (!val) return null
  if (typeof val === 'object') return val
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      // Try to extract JSON from markdown code blocks
      const match = val.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        try {
          return JSON.parse(match[1].trim())
        } catch {
          return null
        }
      }
      return null
    }
  }
  return null
}

function parseAgentResponse(result: any): AgentData | null {
  if (!result) return null

  // Strategy 1: Try result.response.result directly (standard path)
  let data = tryParseJSON(result?.response?.result)
  if (data && typeof data === 'object' && (data.message || data.metrics || data.lowStockAlerts || data.inventoryItems)) {
    return data as AgentData
  }

  // Strategy 2: Check if result.response.result.text contains JSON
  const textField = result?.response?.result?.text
  if (textField) {
    const parsed = tryParseJSON(textField)
    if (parsed && typeof parsed === 'object' && (parsed.message || parsed.metrics || parsed.lowStockAlerts)) {
      return parsed as AgentData
    }
  }

  // Strategy 3: Try raw_response field (contains original unprocessed response)
  if (result?.raw_response) {
    const rawParsed = tryParseJSON(result.raw_response)
    if (rawParsed) {
      // raw_response may be nested: { response: "{ ... }" } or { response: { ... } }
      let inner = rawParsed?.response
      if (typeof inner === 'string') {
        inner = tryParseJSON(inner)
      }
      if (inner && typeof inner === 'object' && (inner.message || inner.metrics || inner.lowStockAlerts)) {
        return inner as AgentData
      }
      // Or the raw_response itself might be the data
      if (rawParsed && typeof rawParsed === 'object' && (rawParsed.message || rawParsed.metrics || rawParsed.lowStockAlerts)) {
        return rawParsed as AgentData
      }
    }
  }

  // Strategy 4: Check result.response directly
  const respDirect = tryParseJSON(result?.response)
  if (respDirect && typeof respDirect === 'object' && (respDirect.message || respDirect.metrics || respDirect.lowStockAlerts)) {
    return respDirect as AgentData
  }

  // Strategy 5: Check result.response.message for JSON string
  const msgField = result?.response?.message
  if (msgField && typeof msgField === 'string') {
    const msgParsed = tryParseJSON(msgField)
    if (msgParsed && typeof msgParsed === 'object' && (msgParsed.metrics || msgParsed.lowStockAlerts)) {
      return msgParsed as AgentData
    }
    // If message is just plain text, return it as the message field
    return { message: msgField } as AgentData
  }

  // Strategy 6: Try result itself
  if (result && typeof result === 'object' && (result.message || result.metrics || result.lowStockAlerts)) {
    return result as AgentData
  }

  return null
}

function extractMessageFromResult(result: any): string {
  // Try to get any text from the agent response
  const parsed = parseAgentResponse(result)
  if (parsed?.message) return parsed.message

  const resp = result?.response
  if (resp?.message) return resp.message
  if (resp?.result?.text) return typeof resp.result.text === 'string' ? resp.result.text : JSON.stringify(resp.result.text)
  if (resp?.result?.message) return resp.result.message

  return 'Response received. Dashboard updated.'
}

// ---- Markdown renderer ----
function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

function getStatusColor(status: string): string {
  const s = (status ?? '').toLowerCase()
  if (s === 'in stock' || s === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (s === 'low') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (s === 'out of stock') return 'bg-red-100 text-red-800 border-red-200'
  if (s === 'pending') return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  if (s === 'in transit') return 'bg-blue-100 text-blue-800 border-blue-200'
  return 'bg-secondary text-secondary-foreground'
}

function getPriorityColor(priority: string): string {
  const p = (priority ?? '').toLowerCase()
  if (p === 'high') return 'bg-red-100 text-red-700 border-red-200'
  if (p === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-green-100 text-green-700 border-green-200'
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value)
}

function getTrendIcon(trend: string) {
  const t = (trend ?? '').toLowerCase()
  if (t === 'up') return <FiArrowUp className="w-4 h-4 text-emerald-600" />
  if (t === 'down') return <FiArrowDown className="w-4 h-4 text-red-500" />
  return <FiMinus className="w-4 h-4 text-muted-foreground" />
}

// ---- Glass Card Wrapper ----
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('bg-card/75 backdrop-blur-md border border-white/18 shadow-md', className)}>
      {children}
    </Card>
  )
}

// ---- Metric Card ----
function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <GlassCard>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold font-serif text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">{icon}</div>
        </div>
      </CardContent>
    </GlassCard>
  )
}

// ---- Skeleton Loaders ----
function MetricSkeleton() {
  return (
    <Card className="bg-card/75 backdrop-blur-md border border-white/18 shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  )
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ---- ErrorBoundary ----
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ===================================================================
// MAIN PAGE COMPONENT
// ===================================================================
export default function Page() {
  // ---- Navigation ----
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'inventory' | 'sales' | 'orders'>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ---- Agent Data ----
  const [agentData, setAgentData] = useState<AgentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // ---- Chat ----
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ---- Session ID ----
  const [sessionId] = useState(() =>
    typeof window !== 'undefined' ? crypto.randomUUID() : 'default-session'
  )

  // ---- Notification bell ----
  const [bellPulse, setBellPulse] = useState(false)

  // ---- Filters ----
  const [inventorySearch, setInventorySearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [orderTab, setOrderTab] = useState('All')
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [salesPeriod, setSalesPeriod] = useState('30d')

  // ---- Effective Data ----
  const data: AgentData = agentData ?? {}
  const metrics = data?.metrics
  const lowStockAlerts = Array.isArray(data?.lowStockAlerts) ? data.lowStockAlerts : []
  const inventoryItems = Array.isArray(data?.inventoryItems) ? data.inventoryItems : []
  const salesData = Array.isArray(data?.salesData) ? data.salesData : []
  const orders = Array.isArray(data?.orders) ? data.orders : []

  // ---- Bell pulse when low stock alerts exist ----
  useEffect(() => {
    if (lowStockAlerts.length > 0) {
      setBellPulse(true)
      const timer = setTimeout(() => setBellPulse(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [lowStockAlerts.length])

  // ---- Initial Agent Call ----
  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActiveAgentId(AGENT_ID)
    try {
      const result = await callAIAgent(
        'Provide a complete inventory dashboard summary with all metrics, top 10 low stock alerts by priority, a sample of inventory items across categories, estimated sales data, and any reorder recommendations.',
        AGENT_ID,
        { session_id: sessionId }
      )

      console.log('[FitGear] Agent result:', JSON.stringify(result).substring(0, 500))

      if (result.success) {
        const parsed = parseAgentResponse(result)
        console.log('[FitGear] Parsed data keys:', parsed ? Object.keys(parsed) : 'null')
        if (parsed) {
          setAgentData(parsed)
          if (parsed.message) {
            setChatMessages([{ role: 'agent', content: parsed.message, timestamp: new Date() }])
          }
        } else {
          console.warn('[FitGear] Could not parse. Full result:', result)
          setError('Could not parse agent response. Try asking a question in the chat.')
        }
      } else {
        setError(result.error ?? 'Agent call failed. Please retry.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [sessionId])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // ---- Chat scroll ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // ---- Chat Send ----
  const sendChat = async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date() }
    setChatMessages((prev) => [...prev, userMsg])
    setChatLoading(true)
    setActiveAgentId(AGENT_ID)
    try {
      const result = await callAIAgent(msg, AGENT_ID, { session_id: sessionId })
      console.log('[FitGear Chat] Result:', JSON.stringify(result).substring(0, 500))
      if (result.success) {
        const parsed = parseAgentResponse(result)
        console.log('[FitGear Chat] Parsed keys:', parsed ? Object.keys(parsed) : 'null')
        if (parsed) {
          // Update dashboard data with any new structured data
          setAgentData((prev) => {
            const updated = { ...prev }
            if (parsed.metrics) updated.metrics = parsed.metrics
            if (Array.isArray(parsed.lowStockAlerts) && parsed.lowStockAlerts.length > 0) updated.lowStockAlerts = parsed.lowStockAlerts
            if (Array.isArray(parsed.inventoryItems) && parsed.inventoryItems.length > 0) updated.inventoryItems = parsed.inventoryItems
            if (Array.isArray(parsed.salesData) && parsed.salesData.length > 0) updated.salesData = parsed.salesData
            if (Array.isArray(parsed.orders) && parsed.orders.length > 0) updated.orders = parsed.orders
            if (parsed.message) updated.message = parsed.message
            return updated
          })
          const agentText = parsed?.message ?? extractMessageFromResult(result)
          setChatMessages((prev) => [...prev, { role: 'agent', content: agentText, timestamp: new Date() }])
        } else {
          const fallbackText = extractMessageFromResult(result)
          setChatMessages((prev) => [...prev, { role: 'agent', content: fallbackText, timestamp: new Date() }])
        }
      } else {
        setChatMessages((prev) => [...prev, { role: 'agent', content: result.error ?? 'Sorry, something went wrong.', timestamp: new Date() }])
      }
    } catch (e) {
      setChatMessages((prev) => [...prev, { role: 'agent', content: e instanceof Error ? e.message : 'Network error.', timestamp: new Date() }])
    } finally {
      setChatLoading(false)
      setActiveAgentId(null)
    }
  }

  // ---- Toggle order expand ----
  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  // ---- Filtered inventory ----
  const filteredInventory = inventoryItems.filter((item) => {
    const matchSearch = !inventorySearch || (item?.product ?? '').toLowerCase().includes(inventorySearch.toLowerCase()) || (item?.sku ?? '').toLowerCase().includes(inventorySearch.toLowerCase())
    const matchCategory = categoryFilter === 'All' || (item?.category ?? '') === categoryFilter
    const matchStatus = statusFilter === 'All' || (item?.status ?? '') === statusFilter
    return matchSearch && matchCategory && matchStatus
  })

  const categories = ['All', ...Array.from(new Set(inventoryItems.map((i) => i?.category ?? '').filter(Boolean)))]
  const statuses = ['All', 'In Stock', 'Low', 'Out of Stock']

  // ---- Filtered orders ----
  const filteredOrders = orders.filter((o) => {
    if (orderTab === 'All') return true
    if (orderTab === 'Pending') return (o?.status ?? '').toLowerCase() === 'pending' || (o?.status ?? '').toLowerCase() === 'in transit'
    if (orderTab === 'Completed') return (o?.status ?? '').toLowerCase() === 'completed'
    return true
  })

  // ---- Sales computations ----
  const totalRevenue = salesData.reduce((sum, s) => sum + (s?.revenue ?? 0), 0)
  const totalUnitsSold = salesData.reduce((sum, s) => sum + (s?.unitsSold ?? 0), 0)
  const categoryBreakdown = salesData.reduce<Record<string, number>>((acc, s) => {
    const cat = s?.category ?? 'Other'
    acc[cat] = (acc[cat] ?? 0) + (s?.revenue ?? 0)
    return acc
  }, {})
  const topCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]
  const maxCatRevenue = topCategory ? topCategory[1] : 1

  // ---- Navigation items ----
  const navItems = [
    { key: 'dashboard' as const, label: 'Dashboard', icon: <FiLayout className="w-5 h-5" /> },
    { key: 'inventory' as const, label: 'Inventory', icon: <FiBox className="w-5 h-5" /> },
    { key: 'sales' as const, label: 'Sales', icon: <FiBarChart2 className="w-5 h-5" /> },
    { key: 'orders' as const, label: 'Orders', icon: <FiShoppingCart className="w-5 h-5" /> },
  ]

  // Has any data loaded
  const hasData = !!(metrics || lowStockAlerts.length > 0 || inventoryItems.length > 0 || salesData.length > 0 || orders.length > 0)

  // ====== RENDER ======
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans" style={{ backgroundImage: 'linear-gradient(135deg, hsl(120 25% 96%) 0%, hsl(140 30% 94%) 35%, hsl(160 25% 95%) 70%, hsl(100 20% 96%) 100%)' }}>
        <div className="flex min-h-screen">
          {/* ===== SIDEBAR ===== */}
          <aside className={cn('fixed inset-y-0 left-0 z-40 flex flex-col bg-card/80 backdrop-blur-lg border-r border-border shadow-lg transition-all duration-300', sidebarOpen ? 'w-56' : 'w-16')}>
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <FiPackage className="w-4 h-4 text-primary-foreground" />
              </div>
              {sidebarOpen && <span className="font-serif font-bold text-lg text-foreground tracking-tight">Burnlab</span>}
            </div>

            {/* Nav */}
            <nav className="flex-1 py-4 space-y-1 px-2">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setCurrentPage(item.key)}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200', currentPage === item.key ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
                >
                  {item.icon}
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              ))}
            </nav>

            {/* Agent Status */}
            {sidebarOpen && (
              <div className="px-3 pb-4">
                <GlassCard className="border-border/50">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Agent</p>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', activeAgentId ? 'bg-emerald-500 animate-pulse' : hasData ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                      <span className="text-xs text-foreground truncate">Inventory Intelligence</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{AGENT_ID.slice(0, 12)}...</p>
                  </CardContent>
                </GlassCard>
              </div>
            )}

            {/* Collapse button */}
            <button
              onClick={() => setSidebarOpen((p) => !p)}
              className="flex items-center justify-center h-12 border-t border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {sidebarOpen ? <FiX className="w-4 h-4" /> : <FiMenu className="w-4 h-4" />}
            </button>
          </aside>

          {/* ===== MAIN AREA ===== */}
          <main className={cn('flex-1 transition-all duration-300', sidebarOpen ? 'ml-56' : 'ml-16')}>
            {/* Header */}
            <header className="sticky top-0 z-30 h-16 bg-card/70 backdrop-blur-lg border-b border-border flex items-center justify-between px-6">
              <div className="flex items-center gap-4">
                <h1 className="font-serif font-bold text-xl text-foreground">
                  {currentPage === 'dashboard' && 'Dashboard'}
                  {currentPage === 'inventory' && 'Inventory'}
                  {currentPage === 'sales' && 'Sales Analysis'}
                  {currentPage === 'orders' && 'Orders'}
                </h1>
                {loading && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    Loading data...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Refresh */}
                <Button variant="ghost" size="sm" onClick={fetchDashboard} disabled={loading} className="text-muted-foreground hover:text-foreground">
                  <FiRefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                </Button>

                {/* Bell */}
                <div className="relative">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground relative">
                    <FiBell className={cn('w-4 h-4', bellPulse && 'animate-bounce text-amber-500')} />
                  </Button>
                  {lowStockAlerts.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">{lowStockAlerts.length}</span>
                  )}
                </div>
              </div>
            </header>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{error}</span>
                  <Button variant="outline" size="sm" onClick={fetchDashboard} className="ml-auto text-xs flex-shrink-0">
                    Retry
                  </Button>
                </div>
              )}

              {/* ===== DASHBOARD ===== */}
              {currentPage === 'dashboard' && (
                <div className="space-y-6">
                  {/* Metrics row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {loading ? (
                      <>
                        <MetricSkeleton />
                        <MetricSkeleton />
                        <MetricSkeleton />
                        <MetricSkeleton />
                      </>
                    ) : (
                      <>
                        <MetricCard icon={<FiBox className="w-5 h-5" />} label="Total SKUs" value={metrics?.totalSKUs ?? 0} sub="Products tracked" />
                        <MetricCard icon={<FiAlertTriangle className="w-5 h-5" />} label="Low Stock Items" value={metrics?.lowStockCount ?? lowStockAlerts.length} sub={lowStockAlerts.length > 0 ? `${lowStockAlerts.length} alerts active` : 'All stocked'} />
                        <MetricCard icon={<FiShoppingCart className="w-5 h-5" />} label="Pending Orders" value={metrics?.pendingOrders ?? 0} />
                        <MetricCard icon={<FiTrendingUp className="w-5 h-5" />} label="Top Seller" value={metrics?.topSeller ?? '--'} />
                      </>
                    )}
                  </div>

                  {/* Below: Alerts + Chat */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Low Stock Alerts */}
                    <div className="lg:col-span-3">
                      <GlassCard>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-serif flex items-center gap-2">
                            <FiAlertTriangle className="w-4 h-4 text-amber-500" />
                            Low Stock Alerts
                            {lowStockAlerts.length > 0 && (
                              <Badge variant="secondary" className="text-[10px] ml-1">{lowStockAlerts.length}</Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {loading ? (
                            <TableSkeleton rows={4} />
                          ) : lowStockAlerts.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <FiPackage className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              <p className="text-sm">No low stock alerts right now.</p>
                              <p className="text-xs mt-1">Ask the agent to check stock levels.</p>
                            </div>
                          ) : (
                            <ScrollArea className="max-h-80">
                              <div className="space-y-2">
                                {lowStockAlerts.map((alert, i) => (
                                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-background/60 border border-border/50 hover:bg-background/90 transition-colors">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{alert?.product ?? 'Unknown'}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Stock: <span className="font-mono font-semibold">{alert?.currentStock ?? 0}</span> / Threshold: <span className="font-mono">{alert?.threshold ?? 0}</span>
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                                      <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', getPriorityColor(alert?.priority ?? ''))}>
                                        {alert?.priority ?? 'N/A'}
                                      </Badge>
                                      <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', getStatusColor(alert?.status ?? ''))}>
                                        {alert?.status ?? 'N/A'}
                                      </Badge>
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Reorder: {alert?.recommendedOrder ?? 0}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </CardContent>
                      </GlassCard>
                    </div>

                    {/* Chat Panel */}
                    <div className="lg:col-span-2">
                      <GlassCard className="flex flex-col h-[420px]">
                        <CardHeader className="pb-2 flex-shrink-0">
                          <CardTitle className="text-base font-serif flex items-center gap-2">
                            <FiMessageSquare className="w-4 h-4 text-primary" />
                            Ask Agent
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col overflow-hidden p-4 pt-0">
                          {/* Messages */}
                          <ScrollArea className="flex-1 pr-2 mb-3">
                            <div className="space-y-3 py-2">
                              {chatMessages.length === 0 && !chatLoading && (
                                <div className="text-center py-6 text-muted-foreground">
                                  <FiMessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
                                  <p className="text-sm">Ask about inventory, stock levels,</p>
                                  <p className="text-sm">reorder needs, or sales trends.</p>
                                  <div className="mt-3 space-y-1.5">
                                    {['Which items are out of stock?', 'What should I reorder this week?', 'Show gloves inventory'].map((q) => (
                                      <button
                                        key={q}
                                        onClick={() => { setChatInput(q); }}
                                        className="block w-full text-xs px-3 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-secondary-foreground transition-colors text-left"
                                      >
                                        {q}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {chatMessages.map((msg, i) => (
                                <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                                  <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm', msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary text-secondary-foreground rounded-bl-md')}>
                                    {msg.role === 'agent' ? renderMarkdown(msg.content) : msg.content}
                                  </div>
                                </div>
                              ))}
                              {chatLoading && (
                                <div className="flex justify-start">
                                  <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                                  </div>
                                </div>
                              )}
                              <div ref={chatEndRef} />
                            </div>
                          </ScrollArea>

                          {/* Input */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Input
                              placeholder="Type a question..."
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                              disabled={chatLoading}
                              className="flex-1 bg-background/60 border-border/60 text-sm"
                            />
                            <Button size="sm" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="px-3 bg-primary hover:bg-primary/90">
                              <FiSend className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </GlassCard>
                    </div>
                  </div>

                  {/* Agent message summary */}
                  {data?.message && !loading && (
                    <GlassCard>
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Agent Summary</p>
                        <div className="text-sm text-foreground">{renderMarkdown(data.message)}</div>
                      </CardContent>
                    </GlassCard>
                  )}
                </div>
              )}

              {/* ===== INVENTORY ===== */}
              {currentPage === 'inventory' && (
                <div className="space-y-4">
                  {/* Filters */}
                  <GlassCard>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Search products or SKUs..."
                            value={inventorySearch}
                            onChange={(e) => setInventorySearch(e.target.value)}
                            className="pl-9 bg-background/60 border-border/60 text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <FiFilter className="w-4 h-4 text-muted-foreground" />
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="text-sm px-3 py-2 rounded-xl border border-border bg-background/60 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-sm px-3 py-2 rounded-xl border border-border bg-background/60 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {statuses.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </CardContent>
                  </GlassCard>

                  {/* Inventory hint when empty */}
                  {!loading && inventoryItems.length === 0 && (
                    <GlassCard>
                      <CardContent className="p-6 text-center">
                        <FiBox className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                        <p className="text-sm font-medium text-foreground mb-1">No inventory items loaded yet</p>
                        <p className="text-xs text-muted-foreground mb-3">Ask the agent to provide inventory data</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCurrentPage('dashboard')
                            setChatInput('Show me the full inventory list with all products, SKUs, categories, stock levels, and status')
                          }}
                        >
                          <FiMessageSquare className="w-3.5 h-3.5 mr-1.5" />
                          Ask for Inventory Data
                        </Button>
                      </CardContent>
                    </GlassCard>
                  )}

                  {/* Table */}
                  {(loading || inventoryItems.length > 0) && (
                    <GlassCard>
                      <CardContent className="p-0">
                        {loading ? (
                          <TableSkeleton rows={6} />
                        ) : filteredInventory.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <FiBox className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">No items match your filter</p>
                            <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setInventorySearch(''); setCategoryFilter('All'); setStatusFilter('All') }}>
                              Reset Filters
                            </Button>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/60 bg-muted/30">
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                                  <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                                  <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reorder At</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Restocked</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredInventory.map((item, i) => (
                                  <tr key={i} className={cn('border-b border-border/30 transition-colors hover:bg-muted/20', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}>
                                    <td className="py-3 px-4 font-medium text-foreground">{item?.product ?? '--'}</td>
                                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{item?.sku ?? '--'}</td>
                                    <td className="py-3 px-4">
                                      <Badge variant="secondary" className="text-[10px]">{item?.category ?? '--'}</Badge>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-semibold">{item?.currentStock ?? 0}</td>
                                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">{item?.reorderThreshold ?? 0}</td>
                                    <td className="py-3 px-4 text-center">
                                      <Badge variant="outline" className={cn('text-[10px] px-2.5 py-0.5', getStatusColor(item?.status ?? ''))}>
                                        {item?.status ?? '--'}
                                      </Badge>
                                    </td>
                                    <td className="py-3 px-4 text-xs text-muted-foreground">{item?.lastRestocked ?? '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </GlassCard>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Showing {filteredInventory.length} of {inventoryItems.length} items
                  </p>
                </div>
              )}

              {/* ===== SALES ===== */}
              {currentPage === 'sales' && (
                <div className="space-y-6">
                  {/* Period Selector */}
                  <div className="flex items-center gap-2">
                    {['7d', '30d', '90d'].map((p) => (
                      <Button
                        key={p}
                        variant={salesPeriod === p ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSalesPeriod(p)}
                        className="text-xs px-4"
                      >
                        {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
                      </Button>
                    ))}
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {loading ? (
                      <>
                        <MetricSkeleton />
                        <MetricSkeleton />
                        <MetricSkeleton />
                      </>
                    ) : (
                      <>
                        <MetricCard icon={<FiDollarSign className="w-5 h-5" />} label="Total Revenue" value={formatCurrency(totalRevenue)} />
                        <MetricCard icon={<FiPackage className="w-5 h-5" />} label="Units Sold" value={totalUnitsSold.toLocaleString()} />
                        <MetricCard icon={<FiTrendingUp className="w-5 h-5" />} label="Top Category" value={topCategory ? topCategory[0] : '--'} sub={topCategory ? formatCurrency(topCategory[1]) : undefined} />
                      </>
                    )}
                  </div>

                  {/* Sales hint when no data */}
                  {!loading && salesData.length === 0 && (
                    <GlassCard>
                      <CardContent className="p-6 text-center">
                        <FiBarChart2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                        <p className="text-sm font-medium text-foreground mb-1">No sales data loaded yet</p>
                        <p className="text-xs text-muted-foreground mb-3">Ask the agent to analyze sales trends</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCurrentPage('dashboard')
                            setChatInput('Show me sales analysis with top selling products, revenue, and trends by category')
                          }}
                        >
                          <FiMessageSquare className="w-3.5 h-3.5 mr-1.5" />
                          Ask for Sales Data
                        </Button>
                      </CardContent>
                    </GlassCard>
                  )}

                  {salesData.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Product performance list */}
                      <div className="lg:col-span-2">
                        <GlassCard>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-serif">Product Performance</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {salesData
                                .slice()
                                .sort((a, b) => (b?.unitsSold ?? 0) - (a?.unitsSold ?? 0))
                                .map((item, i) => {
                                  const maxUnits = salesData.reduce((max, s) => Math.max(max, s?.unitsSold ?? 0), 1)
                                  const pct = Math.round(((item?.unitsSold ?? 0) / maxUnits) * 100)
                                  return (
                                    <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-background/60 border border-border/40 hover:bg-background/90 transition-colors">
                                      <span className="text-xs font-bold text-muted-foreground w-6 text-right">#{i + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-sm font-medium text-foreground truncate">{item?.product ?? '--'}</span>
                                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                            {getTrendIcon(item?.trend ?? '')}
                                            <span className="text-sm font-semibold font-mono text-foreground">{formatCurrency(item?.revenue)}</span>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full bg-primary/70 transition-all duration-500" style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className="text-[10px] text-muted-foreground font-mono w-16 text-right">{item?.unitsSold ?? 0} units</span>
                                        </div>
                                      </div>
                                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">{item?.category ?? '--'}</Badge>
                                    </div>
                                  )
                                })}
                            </div>
                          </CardContent>
                        </GlassCard>
                      </div>

                      {/* Category Breakdown */}
                      <div className="lg:col-span-1">
                        <GlassCard>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base font-serif">Category Breakdown</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {Object.entries(categoryBreakdown)
                                .sort((a, b) => b[1] - a[1])
                                .map(([cat, rev], i) => {
                                  const pct = Math.round((rev / (maxCatRevenue || 1)) * 100)
                                  return (
                                    <div key={i} className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-foreground">{cat}</span>
                                        <span className="text-xs font-mono text-muted-foreground">{formatCurrency(rev)}</span>
                                      </div>
                                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `hsl(${142 + i * 20} 60% ${30 + i * 5}%)` }} />
                                      </div>
                                    </div>
                                  )
                                })}
                            </div>
                          </CardContent>
                        </GlassCard>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===== ORDERS ===== */}
              {currentPage === 'orders' && (
                <div className="space-y-4">
                  {/* Tab Toggle */}
                  <Tabs defaultValue="All" value={orderTab} onValueChange={setOrderTab}>
                    <TabsList className="bg-muted/60 backdrop-blur-sm">
                      <TabsTrigger value="All" className="text-xs">All Orders</TabsTrigger>
                      <TabsTrigger value="Pending" className="text-xs">Pending</TabsTrigger>
                      <TabsTrigger value="Completed" className="text-xs">Completed</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Orders hint when no data */}
                  {!loading && orders.length === 0 && (
                    <GlassCard>
                      <CardContent className="p-6 text-center">
                        <FiShoppingCart className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                        <p className="text-sm font-medium text-foreground mb-1">No order data loaded yet</p>
                        <p className="text-xs text-muted-foreground mb-3">Ask the agent about pending or recent orders</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCurrentPage('dashboard')
                            setChatInput('Show me all pending and recent orders with details')
                          }}
                        >
                          <FiMessageSquare className="w-3.5 h-3.5 mr-1.5" />
                          Ask for Order Data
                        </Button>
                      </CardContent>
                    </GlassCard>
                  )}

                  {/* Orders Table */}
                  {(loading || orders.length > 0) && (
                    <GlassCard>
                      <CardContent className="p-0">
                        {loading ? (
                          <TableSkeleton rows={5} />
                        ) : filteredOrders.length === 0 ? (
                          <div className="text-center py-12 text-muted-foreground">
                            <FiShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-medium">No orders found</p>
                            {orderTab !== 'All' && (
                              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setOrderTab('All')}>
                                View All Orders
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border/60 bg-muted/30">
                                  <th className="w-8 py-3 px-3" />
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order ID</th>
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                                  <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
                                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredOrders.map((order, i) => {
                                  const isExpanded = expandedOrders.has(order?.orderId ?? '')
                                  const orderItems = Array.isArray(order?.items) ? order.items : []
                                  return (
                                    <React.Fragment key={i}>
                                      <tr
                                        className={cn('border-b border-border/30 cursor-pointer transition-colors hover:bg-muted/20', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/10')}
                                        onClick={() => toggleOrder(order?.orderId ?? '')}
                                      >
                                        <td className="py-3 px-3 text-center">
                                          {isExpanded ? <FiChevronDown className="w-4 h-4 text-muted-foreground" /> : <FiChevronRight className="w-4 h-4 text-muted-foreground" />}
                                        </td>
                                        <td className="py-3 px-4 font-mono font-medium text-foreground">{order?.orderId ?? '--'}</td>
                                        <td className="py-3 px-4 text-muted-foreground">{order?.date ?? '--'}</td>
                                        <td className="py-3 px-4 text-right font-mono">{order?.itemCount ?? 0}</td>
                                        <td className="py-3 px-4 text-center">
                                          <Badge variant="outline" className={cn('text-[10px] px-2.5 py-0.5', getStatusColor(order?.status ?? ''))}>
                                            {order?.status ?? '--'}
                                          </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-muted-foreground">{order?.supplier ?? '--'}</td>
                                      </tr>
                                      {isExpanded && orderItems.length > 0 && (
                                        <tr className="bg-muted/10">
                                          <td colSpan={6} className="py-0 px-0">
                                            <div className="px-12 py-3 border-b border-border/20">
                                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Line Items</p>
                                              <div className="space-y-1">
                                                {orderItems.map((lineItem, j) => (
                                                  <div key={j} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-background/60">
                                                    <span className="text-sm text-foreground">{lineItem?.name ?? 'Unknown item'}</span>
                                                    <span className="text-sm font-mono text-muted-foreground">x{lineItem?.quantity ?? 0}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </GlassCard>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Showing {filteredOrders.length} of {orders.length} orders
                  </p>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
