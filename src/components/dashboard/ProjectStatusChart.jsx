import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export default function ProjectStatusChart({ projects }) {
    const statusData = [
        { name: 'Draft', value: projects.filter(p => p.status === 'draft').length, color: '#f59e0b' },
        { name: 'Analyzed', value: projects.filter(p => p.status === 'analyzed').length, color: '#10b981' },
        { name: 'Locked', value: projects.filter(p => p.status === 'locked').length, color: '#6366f1' },
        { name: 'Closed', value: projects.filter(p => p.status === 'closed').length, color: '#64748b' }
    ].filter(item => item.value > 0);

    if (statusData.length === 0) {
        return null;
    }

    return (
        <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">Project Status</CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {statusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend 
                            verticalAlign="bottom" 
                            height={36}
                            formatter={(value, entry) => (
                                <span className="text-sm text-slate-700">
                                    {value} ({entry.payload.value})
                                </span>
                            )}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}