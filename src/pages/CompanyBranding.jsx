import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Palette, Upload, X, Eye, Plus } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { usePermissions } from '@/components/hooks/usePermissions';

export default function CompanyBranding() {
    const { userRole } = usePermissions();
    const queryClient = useQueryClient();
    const [editingCompany, setEditingCompany] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [previewLogo, setPreviewLogo] = useState(null);

    // Fetch all companies
    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.Company.list()
    });

    // Fetch company settings
    const { data: companySettings = [], isLoading } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    // Create company branding
    const createBrandingMutation = useMutation({
        mutationFn: async (data) => {
            return await base44.entities.CompanySettings.create(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['companySettings'] });
            queryClient.invalidateQueries({ queryKey: ['companyBranding'] });
            toast.success('Branding created successfully');
            setEditingCompany(null);
            setIsCreating(false);
            setPreviewLogo(null);
        },
        onError: (error) => {
            toast.error(`Failed to create branding: ${error.message}`);
        }
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
        setIsCreating(false);
        setEditingCompany({
            id: company.id,
            company: company.company,
            departments: company.departments,
            logo_url: company.logo_url || '',
            primary_color: company.primary_color || '213 57% 14%',
            secondary_color: company.secondary_color || '142 64% 24%',
            font_family: company.font_family || 'Inter, sans-serif'
        });
        setPreviewLogo(company.logo_url || null);
    };

    const handleCreateNew = () => {
        setIsCreating(true);
        setEditingCompany({
            company: '',
            departments: '',
            logo_url: '',
            primary_color: '213 57% 14%',
            secondary_color: '142 64% 24%',
            font_family: 'Inter, sans-serif'
        });
        setPreviewLogo(null);
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file');
            return;
        }

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

    const isValidHSL = (hsl) => {
        if (!hsl) return true;
        const hslRegex = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/;
        return hslRegex.test(hsl.trim());
    };

    const hexToHSL = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return '';

        let r = parseInt(result[1], 16) / 255;
        let g = parseInt(result[2], 16) / 255;
        let b = parseInt(result[3], 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };

    const hslToHex = (hsl) => {
        if (!hsl) return '#0F1E36';
        const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
        if (!parts) return '#0F1E36';

        let h = parseInt(parts[1]) / 360;
        let s = parseInt(parts[2]) / 100;
        let l = parseInt(parts[3]) / 100;

        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        const toHex = x => {
            const hex = Math.round(x * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    const handleSave = () => {
        if (!editingCompany) return;

        if (editingCompany.primary_color && !isValidHSL(editingCompany.primary_color)) {
            toast.error('Invalid primary color HSL format. Use: "hue saturation% lightness%" (e.g., "213 57% 14%")');
            return;
        }
        if (editingCompany.secondary_color && !isValidHSL(editingCompany.secondary_color)) {
            toast.error('Invalid secondary color HSL format. Use: "hue saturation% lightness%" (e.g., "142 64% 24%")');
            return;
        }

        if (isCreating) {
            if (!editingCompany.company || !editingCompany.departments) {
                toast.error('Company name and departments are required');
                return;
            }
            const { id, ...data } = editingCompany;
            createBrandingMutation.mutate(data);
        } else {
            const { id, company, departments, ...data } = editingCompany;
            updateBrandingMutation.mutate({ id, data });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-[#6B7280]">Loading company settings...</div>
            </div>
        );
    }

    const canManageBranding = userRole === 'admin' || userRole === 'ceo';

    if (!canManageBranding) {
        return (
            <div className="p-6">
                <div className="text-center text-red-600">
                    Access Denied: Only admins and CEOs can manage company branding.
                </div>
            </div>
        );
    }

    const availableCompanies = companies.filter(
        company => !companySettings.some(setting => setting.company === company.name)
    );

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Company Branding' }]} />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1F2937]">Company Branding</h1>
                    <p className="text-sm text-[#6B7280] mt-1">Configure logos, colors, and fonts for each company</p>
                </div>
                {availableCompanies.length > 0 && (
                    <Button onClick={handleCreateNew} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Add Company Branding
                    </Button>
                )}
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

            {/* Edit/Create Dialog */}
            <Dialog open={!!editingCompany} onOpenChange={(open) => {
                if (!open) {
                    setEditingCompany(null);
                    setIsCreating(false);
                    setPreviewLogo(null);
                }
            }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {isCreating ? 'Create' : 'Edit'} Company Branding
                            {!isCreating && ` - ${editingCompany?.company}`}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Company Selection (for new branding only) */}
                        {isCreating && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="company">Company *</Label>
                                    <Select
                                        value={editingCompany.company}
                                        onValueChange={(value) => setEditingCompany(prev => ({ ...prev, company: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a company" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableCompanies.map((company) => (
                                                <SelectItem key={company.id} value={company.name}>
                                                    {company.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="departments">Departments (comma-separated) *</Label>
                                    <Input
                                        id="departments"
                                        value={editingCompany.departments || ''}
                                        onChange={(e) => setEditingCompany(prev => ({ ...prev, departments: e.target.value }))}
                                        placeholder="e.g., HR, Finance, IT"
                                    />
                                    <p className="text-xs text-[#6B7280]">Admin is always included automatically</p>
                                </div>
                            </>
                        )}

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
                            <Label>Primary Color</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    type="color"
                                    value={hslToHex(editingCompany?.primary_color)}
                                    onChange={(e) => setEditingCompany(prev => ({ ...prev, primary_color: hexToHSL(e.target.value) }))}
                                    className="w-16 h-10 p-1 cursor-pointer"
                                />
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
                            <Label>Secondary Color</Label>
                            <div className="flex items-center gap-3">
                                <Input
                                    type="color"
                                    value={hslToHex(editingCompany?.secondary_color)}
                                    onChange={(e) => setEditingCompany(prev => ({ ...prev, secondary_color: hexToHSL(e.target.value) }))}
                                    className="w-16 h-10 p-1 cursor-pointer"
                                />
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
                            <Select
                                value={editingCompany?.font_family || 'Inter, sans-serif'}
                                onValueChange={(value) => setEditingCompany(prev => ({ ...prev, font_family: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Inter, sans-serif">Inter (Default)</SelectItem>
                                    <SelectItem value="Roboto, sans-serif">Roboto</SelectItem>
                                    <SelectItem value="Open Sans, sans-serif">Open Sans</SelectItem>
                                    <SelectItem value="Lato, sans-serif">Lato</SelectItem>
                                    <SelectItem value="Montserrat, sans-serif">Montserrat</SelectItem>
                                    <SelectItem value="Poppins, sans-serif">Poppins</SelectItem>
                                    <SelectItem value="Raleway, sans-serif">Raleway</SelectItem>
                                    <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                                    <SelectItem value="Georgia, serif">Georgia</SelectItem>
                                    <SelectItem value="Times New Roman, serif">Times New Roman</SelectItem>
                                </SelectContent>
                            </Select>
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
                        <Button variant="outline" onClick={() => {
                            setEditingCompany(null);
                            setIsCreating(false);
                            setPreviewLogo(null);
                        }}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSave}
                            disabled={
                                (isCreating && createBrandingMutation.isPending) ||
                                (!isCreating && updateBrandingMutation.isPending) ||
                                (isCreating && (!editingCompany?.company || !editingCompany?.departments))
                            }
                        >
                            {(isCreating ? createBrandingMutation.isPending : updateBrandingMutation.isPending)
                                ? 'Saving...'
                                : (isCreating ? 'Create Branding' : 'Save Changes')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}