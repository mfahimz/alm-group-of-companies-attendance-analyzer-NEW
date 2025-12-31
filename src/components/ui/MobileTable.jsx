import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export default function MobileTable({ data, columns, renderActions, keyField = 'id' }) {
    return (
        <div className="space-y-3">
            {data.map((row) => (
                <Card key={row[keyField]} className="border-0 shadow-md">
                    <CardContent className="p-4">
                        <div className="space-y-3">
                            {columns.map((col) => (
                                <div key={col.key} className="flex justify-between items-start">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        {col.label}
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 text-right">
                                        {col.render ? col.render(row) : row[col.key]}
                                    </span>
                                </div>
                            ))}
                            {renderActions && (
                                <div className="pt-2 border-t flex gap-2">
                                    {renderActions(row)}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export function ResponsiveTable({ 
    data, 
    columns, 
    renderActions, 
    keyField = 'id',
    children // Desktop table content
}) {
    return (
        <>
            {/* Desktop View */}
            <div className="hidden md:block">
                {children}
            </div>
            
            {/* Mobile View */}
            <div className="md:hidden">
                <MobileTable 
                    data={data} 
                    columns={columns} 
                    renderActions={renderActions}
                    keyField={keyField}
                />
            </div>
        </>
    );
}