import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Loader2, Zap, MessageCircle, Clock } from 'lucide-react';

export function Dashboard() {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchMetrics = async () => {
        try {
            const response = await axios.get('http://localhost:8000/metrics');
            setMetrics(response.data);
        } catch (error) {
            console.error('Failed to fetch metrics', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 5000); // Refresh every 5s
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

    if (!metrics) return <div className="p-10 text-center text-red-500">Failed to load metrics</div>;

    // Prepare data for charts (mocking time series from recent logs for now)
    const latencyData = metrics.recent_logs.map((log, i) => ({
        name: `Query ${i + 1}`,
        latency: (log.latency * 1000).toFixed(0) // ms
    }));

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-text mb-6">System Observability</h2>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-surface p-6 rounded-xl border border-secondary/10 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-primary">
                        <MessageCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-secondary">Total Queries</p>
                        <p className="text-2xl font-bold text-text">{metrics.total_queries}</p>
                    </div>
                </div>

                <div className="bg-surface p-6 rounded-xl border border-secondary/10 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-secondary">Avg Latency</p>
                        <p className="text-2xl font-bold text-text">{(metrics.avg_latency * 1000).toFixed(1)} ms</p>
                    </div>
                </div>

                <div className="bg-surface p-6 rounded-xl border border-secondary/10 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-secondary">System Status</p>
                        <p className="text-2xl font-bold text-text">Healthy</p>
                    </div>
                </div>
            </div>

            {/* Latency Chart */}
            <div className="bg-surface p-6 rounded-xl border border-secondary/10 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-text">Recent Query Latency (ms)</h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={latencyData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="name" stroke="var(--secondary)" />
                            <YAxis stroke="var(--secondary)" />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--secondary)' }}
                                itemStyle={{ color: 'var(--text)' }}
                            />
                            <Line type="monotone" dataKey="latency" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Logs Table */}
            <div className="bg-surface rounded-xl border border-secondary/10 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-secondary/10">
                    <h3 className="text-lg font-semibold text-text">Recent Interactions</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary/5 text-secondary font-medium">
                            <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Question</th>
                                <th className="px-4 py-3">Latency</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary/10">
                            {metrics.recent_logs.map((log, i) => (
                                <tr key={i} className="hover:bg-secondary/5 transition-colors">
                                    <td className="px-4 py-3 text-secondary">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                    <td className="px-4 py-3 font-medium text-text">{log.question}</td>
                                    <td className="px-4 py-3 text-secondary">{(log.latency * 1000).toFixed(0)} ms</td>
                                </tr>
                            ))}
                            {metrics.recent_logs.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-secondary">No queries yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
