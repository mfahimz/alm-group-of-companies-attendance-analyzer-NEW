import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AttendanceTrendChart({ data }) {
    return (
        <Card className="border-0 shadow-lg">
            <CardHeader>
                <CardTitle className="text-lg font-bold">Attendance Trends</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                            stroke="#64748b"
                        />
                        <YAxis 
                            tick={{ fontSize: 12 }}
                            stroke="#64748b"
                        />
                        <Tooltip 
                            contentStyle={{ 
                                borderRadius: '8px', 
                                border: 'none', 
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                            }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: '500' }} />
                        <Line 
                            type="monotone" 
                            dataKey="present" 
                            stroke="#10b981" 
                            strokeWidth={2}
                            dot={{ fill: '#10b981', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line 
                            type="monotone" 
                            dataKey="absent" 
                            stroke="#ef4444" 
                            strokeWidth={2}
                            dot={{ fill: '#ef4444', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line 
                            type="monotone" 
                            dataKey="late" 
                            stroke="#f59e0b" 
                            strokeWidth={2}
                            dot={{ fill: '#f59e0b', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}