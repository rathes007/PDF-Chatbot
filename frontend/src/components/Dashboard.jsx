import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, Zap, AlertTriangle, RefreshCw, MessageSquare, Coins, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';

// Use relative URL when served from backend, or localhost for dev
const API_URL = window.location.port === '5173' ? 'http://localhost:8000' : '';

export function Dashboard() {
    const [metrics, setMetrics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchMetrics = async () => {
        try {
            const response = await axios.get(`${API_URL}/metrics`);
            setMetrics(response.data);
            setError(null);
        } catch (err) {
            setError('Failed to load metrics. Is the backend running?');
            console.error('Metrics fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();

        if (autoRefresh) {
            const interval = setInterval(fetchMetrics, 5000);
            return () => clearInterval(interval);
        }
    }, [autoRefresh]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-80px)]">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] gap-4">
                <AlertTriangle className="w-12 h-12 text-yellow-500" />
                <p className="text-secondary">{error}</p>
                <button
                    onClick={fetchMetrics}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    // Prepare chart data
    const latencyData = metrics?.recent_interactions?.map((item, i) => ({
        name: `Q${i + 1}`,
        latency: item.latency_ms,
        tokens: item.tokens_total,
        confidence: Math.round(item.confidence * 100)
    })) || [];

    const dailyData = Object.entries(metrics?.daily_stats || {}).map(([date, stats]) => ({
        date: date.slice(5), // MM-DD format
        queries: stats.total_queries,
        tokens: stats.total_tokens,
        errors: stats.error_count,
        refused: stats.refused_count
    }));

    const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Observability Dashboard</h1>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded"
                        />
                        Auto-refresh (5s)
                    </label>
                    <button
                        onClick={fetchMetrics}
                        className="p-2 hover:bg-secondary/10 rounded-lg transition-colors"
                        title="Refresh now"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Total Queries"
                    value={metrics?.total_queries || 0}
                    icon={<MessageSquare className="w-6 h-6" />}
                    color="blue"
                    subtitle={`${metrics?.refused_rate || 0}% refused`}
                />
                <MetricCard
                    title="Avg Latency"
                    value={`${metrics?.average_latency_ms || 0}ms`}
                    icon={<Clock className="w-6 h-6" />}
                    color="purple"
                    subtitle={`P95: ${metrics?.p95_latency_ms || 0}ms`}
                />
                <MetricCard
                    title="Total Tokens"
                    value={metrics?.total_tokens?.toLocaleString() || 0}
                    icon={<Coins className="w-6 h-6" />}
                    color="green"
                    subtitle={`~${metrics?.avg_tokens_per_query || 0}/query`}
                />
                <MetricCard
                    title="Avg Confidence"
                    value={`${((metrics?.average_confidence || 0) * 100).toFixed(1)}%`}
                    icon={<TrendingUp className="w-6 h-6" />}
                    color="yellow"
                    subtitle={`${metrics?.error_count || 0} errors`}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Latency Chart */}
                <div className="bg-surface rounded-xl p-6 border border-secondary/10">
                    <h3 className="text-lg font-semibold mb-4">Recent Query Latency (ms)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={latencyData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-surface)',
                                    border: '1px solid var(--color-secondary)',
                                    borderRadius: '8px'
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="latency"
                                stroke="#8B5CF6"
                                fill="#8B5CF6"
                                fillOpacity={0.3}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Tokens & Confidence Chart */}
                <div className="bg-surface rounded-xl p-6 border border-secondary/10">
                    <h3 className="text-lg font-semibold mb-4">Tokens & Confidence</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={latencyData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="name" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Bar yAxisId="left" dataKey="tokens" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="right" dataKey="confidence" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Daily Stats */}
            {dailyData.length > 0 && (
                <div className="bg-surface rounded-xl p-6 border border-secondary/10">
                    <h3 className="text-lg font-semibold mb-4">Daily Usage</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="queries" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey="errors" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Recent Interactions Table */}
            <div className="bg-surface rounded-xl p-6 border border-secondary/10">
                <h3 className="text-lg font-semibold mb-4">Recent Interactions</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-secondary/20">
                                <th className="text-left py-3 px-2">Time</th>
                                <th className="text-left py-3 px-2">Question</th>
                                <th className="text-right py-3 px-2">Latency</th>
                                <th className="text-right py-3 px-2">Tokens</th>
                                <th className="text-right py-3 px-2">Confidence</th>
                                <th className="text-center py-3 px-2">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metrics?.recent_interactions?.map((item, i) => (
                                <tr key={i} className="border-b border-secondary/10 hover:bg-secondary/5">
                                    <td className="py-3 px-2 text-secondary">
                                        {new Date(item.timestamp).toLocaleTimeString()}
                                    </td>
                                    <td className="py-3 px-2 max-w-xs truncate">
                                        {item.question}
                                    </td>
                                    <td className="py-3 px-2 text-right">
                                        <span className={item.latency_ms > 2000 ? 'text-red-500' : 'text-green-500'}>
                                            {item.latency_ms}ms
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 text-right">{item.tokens_total}</td>
                                    <td className="py-3 px-2 text-right">
                                        <span className={item.confidence < 0.3 ? 'text-yellow-500' : 'text-green-500'}>
                                            {(item.confidence * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                        {item.was_refused ? (
                                            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-600 rounded text-xs">
                                                Refused
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 bg-green-500/20 text-green-600 rounded text-xs">
                                                OK
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {(!metrics?.recent_interactions || metrics.recent_interactions.length === 0) && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-secondary">
                                        No interactions yet. Start chatting!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent Errors */}
            {metrics?.recent_errors?.length > 0 && (
                <div className="bg-surface rounded-xl p-6 border border-red-500/20">
                    <h3 className="text-lg font-semibold mb-4 text-red-500 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> Recent Errors
                    </h3>
                    <div className="space-y-2">
                        {metrics.recent_errors.map((error, i) => (
                            <div key={i} className="p-3 bg-red-500/5 rounded-lg text-sm">
                                <div className="flex justify-between">
                                    <span className="font-medium text-red-600">{error.type}</span>
                                    <span className="text-secondary text-xs">
                                        {new Date(error.timestamp).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-secondary mt-1">{error.message}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCard({ title, value, icon, color, subtitle }) {
    const colorClasses = {
        blue: 'bg-blue-500/10 text-blue-500',
        purple: 'bg-purple-500/10 text-purple-500',
        green: 'bg-green-500/10 text-green-500',
        yellow: 'bg-yellow-500/10 text-yellow-500'
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface rounded-xl p-6 border border-secondary/10"
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-secondary text-sm">{title}</p>
                    <p className="text-3xl font-bold mt-1">{value}</p>
                    {subtitle && (
                        <p className="text-secondary text-xs mt-1">{subtitle}</p>
                    )}
                </div>
                <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
                    {icon}
                </div>
            </div>
        </motion.div>
    );
}
