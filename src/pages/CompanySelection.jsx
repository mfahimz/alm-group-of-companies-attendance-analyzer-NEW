import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function CompanySelection() {
    const queryClient = useQueryClient();
    const [selectedCompany, setSelectedCompany] = useState(null);

    const { data: currentUser, isLoading: userLoading } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: companySettings, isLoading: settingsLoading } = useQuery({
        queryKey: ['allCompanySettings'],
        queryFn: () => base44.entities.CompanySettings.list(),
        enabled: !!currentUser
    });

    const updateCompanyMutation = useMutation({
        mutationFn: async (company) => {
            await base44.auth.updateMe({ company });
        },
        onSuccess: () => {
            queryClient.invalidateQueries();
            toast.success('Company switched successfully');
            // Reload to apply new company context
            window.location.href = '/Dashboard';
        },
        onError: (error) => {
            toast.error('Failed to switch company');
            console.error(error);
        }
    });

    if (userLoading || settingsLoading) {
        return (
            <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
                <div className="text-[#6B7280]">Loading companies...</div>
            </div>
        );
    }

    // Get assigned companies from user
    const assignedCompanies = currentUser?.assigned_companies 
        ? currentUser.assigned_companies.split(',').map(c => c.trim()).filter(Boolean)
        : [];

    // If user has no assigned companies but has a current company, use that
    const availableCompanies = assignedCompanies.length > 0 
        ? assignedCompanies 
        : (currentUser?.company ? [currentUser.company] : []);

    // If only one company, redirect automatically
    if (availableCompanies.length === 1 && currentUser?.company === availableCompanies[0]) {
        window.location.href = '/Dashboard';
        return null;
    }

    // Get branding for each company
    const companiesWithBranding = availableCompanies.map(companyName => {
        const branding = companySettings?.find(s => s.company === companyName);
        return {
            name: companyName,
            logo: branding?.logo_url,
            primaryColor: branding?.primary_color || '213 57% 14%',
            secondaryColor: branding?.secondary_color || '142 64% 24%'
        };
    });

    const handleCompanySelect = (company) => {
        setSelectedCompany(company);
        updateCompanyMutation.mutate(company.name);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F4F6F9] to-[#E7EBF1] flex items-center justify-center p-6">
            <div className="w-full max-w-5xl">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-[#1F2937] mb-3">
                        Select Your Company
                    </h1>
                    <p className="text-[#6B7280] text-lg">
                        Choose which company context you'd like to work in
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {companiesWithBranding.map((company, index) => (
                        <motion.div
                            key={company.name}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <Card
                                onClick={() => handleCompanySelect(company)}
                                className="cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 group relative overflow-hidden"
                                style={{
                                    borderColor: currentUser?.company === company.name 
                                        ? `hsl(${company.primaryColor})` 
                                        : 'hsl(var(--border))'
                                }}
                            >
                                {/* Gradient Background */}
                                <div 
                                    className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity"
                                    style={{
                                        background: `linear-gradient(135deg, hsl(${company.primaryColor}), hsl(${company.secondaryColor}))`
                                    }}
                                />

                                <CardContent className="p-8 relative">
                                    {/* Active Indicator */}
                                    {currentUser?.company === company.name && (
                                        <div className="absolute top-4 right-4">
                                            <CheckCircle2 
                                                className="w-6 h-6 text-white bg-[#15803D] rounded-full p-1"
                                            />
                                        </div>
                                    )}

                                    {/* Logo or Icon */}
                                    <div className="flex justify-center mb-6">
                                        {company.logo ? (
                                            <img 
                                                src={company.logo} 
                                                alt={company.name}
                                                className="h-24 w-auto object-contain"
                                            />
                                        ) : (
                                            <div 
                                                className="w-24 h-24 rounded-2xl flex items-center justify-center"
                                                style={{
                                                    background: `linear-gradient(135deg, hsl(${company.primaryColor}), hsl(${company.secondaryColor}))`
                                                }}
                                            >
                                                <Building2 className="w-12 h-12 text-white" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Company Name */}
                                    <h2 className="text-2xl font-bold text-[#1F2937] text-center mb-4">
                                        {company.name}
                                    </h2>

                                    {/* Current Badge */}
                                    {currentUser?.company === company.name && (
                                        <div className="flex justify-center mb-4">
                                            <span className="px-3 py-1 bg-[#DCFCE7] text-[#166534] text-xs font-medium rounded-full">
                                                Currently Active
                                            </span>
                                        </div>
                                    )}

                                    {/* Action Indicator */}
                                    <div className="flex items-center justify-center gap-2 text-[#6B7280] group-hover:text-[#1F2937] transition-colors">
                                        <span className="text-sm font-medium">
                                            {currentUser?.company === company.name ? 'Continue' : 'Switch to this company'}
                                        </span>
                                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Help Text */}
                {availableCompanies.length === 0 && (
                    <div className="text-center mt-8">
                        <p className="text-[#6B7280]">
                            No companies assigned. Please contact your administrator.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}