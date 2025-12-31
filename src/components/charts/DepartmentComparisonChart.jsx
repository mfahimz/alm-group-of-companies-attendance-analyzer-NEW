import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function DepartmentComparisonChart({ data }) {
    return (
        <Card className="border-0 shadow-lg">
            <CardHeader>
                <CardTitle className="text-lg font-bold">Department Comparison</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                            dataKey="department" 
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
                        <Bar dataKey="attendance" fill="#6366f1" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="lateCount" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="absences" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}