import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const CompanyContext = createContext();

export const useCompanyFilter = () => {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error('useCompanyFilter must be used within CompanyFilterProvider');
    }
    return context;
};

export const CompanyFilterProvider = ({ children }) => {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Get selected company from localStorage or user's company
    const [selectedCompany, setSelectedCompanyState] = useState(() => {
        const stored = localStorage.getItem('selectedCompany');
        return stored || currentUser?.company || null;
    });

    // Update when user data loads
    useEffect(() => {
        if (currentUser?.company && !selectedCompany) {
            setSelectedCompanyState(currentUser.company);
        }
    }, [currentUser?.company, selectedCompany]);

    const setSelectedCompany = (company) => {
        setSelectedCompanyState(company);
        if (company) {
            localStorage.setItem('selectedCompany', company);
        } else {
            localStorage.removeItem('selectedCompany');
        }
    };

    const clearCompanyFilter = () => {
        setSelectedCompanyState(null);
        localStorage.removeItem('selectedCompany');
    };

    // For privileged roles (admin, ceo, supervisor), allow company switching
    const canSwitchCompany = currentUser?.role === 'admin' || 
                            currentUser?.role === 'ceo' || 
                            currentUser?.role === 'supervisor' ||
                            currentUser?.role === 'hr_manager';

    // Effective company for filtering (for non-privileged users, always use their assigned company)
    const effectiveCompany = canSwitchCompany ? selectedCompany : currentUser?.company;

    const value = {
        selectedCompany: effectiveCompany,
        setSelectedCompany: canSwitchCompany ? setSelectedCompany : () => {},
        clearCompanyFilter: canSwitchCompany ? clearCompanyFilter : () => {},
        canSwitchCompany,
        userCompany: currentUser?.company,
        isLoading: !currentUser
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
};