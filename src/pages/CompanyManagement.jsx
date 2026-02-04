import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function CompanyManagement() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState(null);
    const [formData, setFormData] = useState({ name: '', departments: '', active: true });
    const queryClient = useQueryClient();

    const { data: companies = [], isLoading } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.Company.list('-company_id')
    });

    const createMutation = useMutation({
        mutationFn: async (data) => {
            // Get next company_id
            const maxId = companies.length > 0 ? Math.max(...companies.map(c => c.company_id || 0)) : 0;
            return base44.entities.Company.create({ ...data, company_id: maxId + 1 });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['companies']);
            setDialogOpen(false);
            setFormData({ name: '', departments: '', active: true });
            toast.success('Company created');
        },
        onError: (error) => toast.error(error.message)
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Company.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['companies']);
            setDialogOpen(false);
            setEditingCompany(null);
            setFormData({ name: '', departments: '', active: true });
            toast.success('Company updated');
        },
        onError: (error) => toast.error(error.message)
    });

    const handleSubmit = () => {
        if (!formData.name.trim()) {
            toast.error('Company name is required');
            return;
        }

        if (editingCompany) {
            updateMutation.mutate({ id: editingCompany.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleEdit = (company) => {
        setEditingCompany(company);
        setFormData({
            name: company.name,
            departments: company.departments || '',
            active: company.active
        });
        setDialogOpen(true);
    };

    const handleAdd = () => {
        setEditingCompany(null);
        setFormData({ name: '', departments: '', active: true });
        setDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">Company Management</h1>
                    <p className="text-[#6B7280] mt-1">Manage companies with stable IDs across name changes</p>
                </div>
                <Button onClick={handleAdd}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Company
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        Companies
                        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries(['companies'])}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-[#6B7280]">Loading...</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company ID</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Departments</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {companies.map((company) => (
                                    <TableRow key={company.id}>
                                        <TableCell className="font-mono font-bold text-[#0F1E36]">
                                            #{company.company_id}
                                        </TableCell>
                                        <TableCell className="font-medium">{company.name}</TableCell>
                                        <TableCell className="text-sm text-[#6B7280]">
                                            {company.departments || '-'}
                                        </TableCell>
                                        <TableCell>
                                            {company.active ? (
                                                <Badge className="bg-green-100 text-green-800">Active</Badge>
                                            ) : (
                                                <Badge variant="outline">Inactive</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(company)}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingCompany ? 'Edit Company' : 'Add Company'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label className="text-sm font-medium">Company Name *</label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Enter company name"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Departments</label>
                            <Input
                                value={formData.departments}
                                onChange={(e) => setFormData({ ...formData, departments: e.target.value })}
                                placeholder="Admin,HR,Sales (comma-separated)"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.active}
                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <label className="text-sm font-medium">Active</label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmit}>
                            {editingCompany ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}