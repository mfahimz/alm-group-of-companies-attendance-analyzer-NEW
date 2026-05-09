import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { usePermissions } from '@/components/hooks/usePermissions';
import CompensationTemplates from '@/components/compensation/CompensationTemplates';
import MonthlyPlanning from '@/components/compensation/MonthlyPlanning';
import ApprovalHistory from '@/components/compensation/ApprovalHistory';

export default function CompensationPlanning() {
    const { user: currentUser } = usePermissions();
    const [activeTab, setActiveTab] = useState('templates');

    if (!currentUser) return null;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Breadcrumb items={[{ label: 'Compensation Planning' }]} />

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">Compensation Planning</h1>
                    <p className="text-[#6B7280] mt-1">Manage employee targets, templates and monthly payouts</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-white border border-[#E2E6EC] p-1">
                    <TabsTrigger value="templates" className="data-[state=active]:bg-[#0F1E36] data-[state=active]:text-white">
                        Templates
                    </TabsTrigger>
                    <TabsTrigger value="planning" className="data-[state=active]:bg-[#0F1E36] data-[state=active]:text-white">
                        Monthly Planning
                    </TabsTrigger>
                    <TabsTrigger value="history" className="data-[state=active]:bg-[#0F1E36] data-[state=active]:text-white">
                        Approval History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="templates">
                    <CompensationTemplates />
                </TabsContent>

                <TabsContent value="planning">
                    <MonthlyPlanning />
                </TabsContent>

                <TabsContent value="history">
                    <ApprovalHistory />
                </TabsContent>
            </Tabs>
        </div>
    );
}
