import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Palette, Upload, X, Eye } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';

export default function CompanyBranding() {
    const queryClient = useQueryClient();
    const [editingCompany, setEditingCompany] = useState(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [previewLogo, setPreviewLogo] = useState(null);

    // Fetch company settings
    const { data: companySettings, isLoading } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    // Update company branding
    const updateBrandingMutation = useMutation({
        mutationFn: async ({ id, data }) => {
            return await base44.entities.CompanySettings.update(id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companySettings'] });
            queryClient.invalidateQueries({ queryKey: ['companyBranding'] });
            toast.success('Branding updated successfully');
            setEditingCompany(null);
            setPreviewLogo(null);
        },
        onError: (error) => {
            toast.error(`Failed to update branding: ${error.message}`);
        }
    });

    const handleEdit = (company) => {
        setEditingCompany({
            id: company.id,
            company: company.company,
            logo_url: company.logo_url || '',
            primary_color: company.primary_color || '213 57% 14%',
            secondary_color: company.secondary_color || '142 64% 24%',
            font_family: company.font_family || 'Inter, sans-serif'
        });
        setPreviewLogo(company.logo_url || null);
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Logo must be smaller than 2MB');
            return;
        }

        setUploadingLogo(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setEditingCompany(prev => ({ ...prev, logo_url: file_url }));
            setPreviewLogo(file_url);
            toast.success('Logo uploaded successfully');
        } catch (error) {
            toast.error(`Failed to upload logo: ${error.message}`);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoveLogo = () => {
        setEditingCompany(prev => ({ ...prev, logo_url: '' }));
        setPreviewLogo(null);
    };

    const handleSave = () => {
        if (!editingCompany) return;

        updateBrandingMutation.mutate({
            id: editingCompany.id,
            data: {
                logo_url: editingCompany.logo_url,
                primary_color: editingCompany.primary_color,
                secondary_color: editingCompany.secondary_color,
                font_family: editingCompany.font_family
            }
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-[#6B7280]">Loading company settings...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Company Branding' }]} />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1F2937]">Company Branding</h1>
                    <p className="text-sm text-[#6B7280] mt-1">Configure logos, colors, and fonts for each company</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {companySettings?.map((company) => (
                    <Card key={company.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <CardTitle className="text-lg">{company.company}</CardTitle>
                                    {company.logo_url && (
                                        <div className="mt-3 p-3 bg-[#F9FAFB] rounded-md border border-[#E5E7EB]">
                                            <img 
                                                src={company.logo_url} 
                                                alt={`${company.company} logo`}
                                                className="h-12 w-auto object-contain"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="w-6 h-6 rounded border border-[#E5E7EB]" 
                                        style={{ backgroundColor: `hsl(${company.primary_color || '213 57% 14%'})` }}
                                    />
                                    <span className="text-xs text-[#6B7280]">Primary</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="w-6 h-6 rounded border border-[#E5E7EB]" 
                                        style={{ backgroundColor: `hsl(${company.secondary_color || '142 64% 24%'})` }}
                                    />
                                    <span className="text-xs text-[#6B7280]">Secondary</span>
                                </div>
                                <div className="text-xs text-[#6B7280]">
                                    Font: <span className="font-medium">{company.font_family || 'Default'}</span>
                                </div>
                            </div>
                            <Button 
                                onClick={() => handleEdit(company)}
                                variant="outline"
                                className="w-full mt-4"
                            >
                                <Palette className="w-4 h-4 mr-2" />
                                Edit Branding
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Branding - {editingCompany?.company}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Logo Upload */}
                        <div className="space-y-3">
                            <Label>Company Logo</Label>
                            {previewLogo ? (
                                <div className="relative inline-block">
                                    <div className="p-4 bg-[#F9FAFB] rounded-lg border-2 border-dashed border-[#E5E7EB]">
                                        <img 
                                            src={previewLogo} 
                                            alt="Logo preview"
                                            className="h-16 w-auto object-contain"
                                        />
                                    </div>
                                    <button
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <Input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        disabled={uploadingLogo}
                                        className="flex-1"
                                    />
                                    {uploadingLogo && <span className="text-sm text-[#6B7280]">Uploading...</span>}
                                </div>
                            )}
                            <p className="text-xs text-[#6B7280]">
                                Recommended: PNG or SVG, max 2MB. Transparent background preferred.
                            </p>
                        </div>

                        {/* Primary Color */}
                        <div className="space-y-2">
                            <Label>Primary Color (HSL Format)</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    value={editingCompany?.primary_color || ''}
                                    onChange={(e) => setEditingCompany(prev => ({ ...prev, primary_color: e.target.value }))}
                                    placeholder="213 57% 14%"
                                    className="flex-1"
                                />
                                <div 
                                    className="w-12 h-10 rounded border-2 border-[#E5E7EB] flex-shrink-0" 
                                    style={{ backgroundColor: `hsl(${editingCompany?.primary_color || '213 57% 14%'})` }}
                                />
                            </div>
                            <p className="text-xs text-[#6B7280]">
                                Format: hue saturation% lightness% (e.g., "213 57% 14%" for navy blue)
                            </p>
                        </div>

                        {/* Secondary Color */}
                        <div className="space-y-2">
                            <Label>Secondary Color (HSL Format)</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    value={editingCompany?.secondary_color || ''}
                                    onChange={(e) => setEditingCompany(prev => ({ ...prev, secondary_color: e.target.value }))}
                                    placeholder="142 64% 24%"
                                    className="flex-1"
                                />
                                <div 
                                    className="w-12 h-10 rounded border-2 border-[#E5E7EB] flex-shrink-0" 
                                    style={{ backgroundColor: `hsl(${editingCompany?.secondary_color || '142 64% 24%'})` }}
                                />
                            </div>
                        </div>

                        {/* Font Family */}
                        <div className="space-y-2">
                            <Label>Font Family</Label>
                            <Input
                                value={editingCompany?.font_family || ''}
                                onChange={(e) => setEditingCompany(prev => ({ ...prev, font_family: e.target.value }))}
                                placeholder="Inter, sans-serif"
                            />
                            <p className="text-xs text-[#6B7280]">
                                Use web-safe fonts or Google Fonts (e.g., "Roboto, sans-serif", "Open Sans, sans-serif")
                            </p>
                        </div>

                        {/* Preview */}
                        <div className="p-4 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-[#4B5563]">
                                <Eye className="w-4 h-4" />
                                Preview
                            </div>
                            <div style={{ fontFamily: editingCompany?.font_family || 'Inter, sans-serif' }}>
                                <Button 
                                    className="text-white"
                                    style={{ backgroundColor: `hsl(${editingCompany?.primary_color || '213 57% 14%'})` }}
                                >
                                    Primary Button
                                </Button>
                                <p className="text-sm text-[#4B5563] mt-3">
                                    This is how text will appear with the selected font family.
                                </p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingCompany(null)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSave}
                            disabled={updateBrandingMutation.isPending}
                        >
                            {updateBrandingMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}