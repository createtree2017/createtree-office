export type UserRole = "ADMIN" | "MANAGER" | "USER";

export interface User {
    id: number;
    email: string;
    name: string;
    role: UserRole;
    isApproved: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthResponse {
    user: Omit<User, "password">;
    token: string;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

// ===== 서비스 상품 마스터 타입 =====

export type BillingType = "monthly" | "per_event" | "one_time" | "quote_based";
export type PriceUnit = "per_month" | "per_event" | "per_person" | "per_item" | "one_time";
export type ItemCategory = "fixed" | "variable";

export interface ServiceItemPrice {
    id?: number;
    itemId?: number;
    tierId: number | null; // null = 전 등급 공통 단가
    price: number; // 만원 단위
}

export interface ServiceItem {
    id?: number;
    serviceId?: number;
    name: string;
    description?: string;
    category: ItemCategory;
    isRequired: boolean;
    priceUnit: PriceUnit;
    unitLabel?: string; // "월", "회", "명", "건"
    sortOrder: number;
    prices: ServiceItemPrice[];
}

export interface ServiceTier {
    id?: number;
    serviceId?: number;
    name: string;
    description?: string;
    minQuantity?: number;
    maxQuantity?: number;
    sortOrder: number;
    isDefault: boolean;
}

export interface Service {
    id: number;
    name: string;
    slug: string;
    description?: string;
    billingType: BillingType;
    isActive: boolean;
    sortOrder: number;
    metadata?: Record<string, any>;
    linkedTaskTemplateId?: number;
    createdAt: string;
    updatedAt: string;
    tiers: ServiceTier[];
    items: ServiceItem[];
}

export interface ServiceCreatePayload {
    name: string;
    slug: string;
    description?: string;
    billingType: BillingType;
    isActive?: boolean;
    sortOrder?: number;
    metadata?: Record<string, any>;
    linkedTaskTemplateId?: number;
    tiers: Omit<ServiceTier, 'id' | 'serviceId'>[];
    items: (Omit<ServiceItem, 'id' | 'serviceId'> & {
        prices: Omit<ServiceItemPrice, 'id' | 'itemId'>[];
    })[];
}

export type DiscountType = 'percentage' | 'fixed_amount';

export interface ContractDiscountPolicy {
    id: number;
    name: string;
    minMonths: number;
    discountType: DiscountType; // 'percentage' = % 할인, 'fixed_amount' = 금액 할인(만원)
    discountRate: number; // percentage: 백분율(5=5%), fixed_amount: 만원 단위
    isActive: boolean;
}

// ===== 견적서 시스템 타입 =====

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type PaymentMethod = 'lump_sum' | 'installment' | 'monthly_settle';

export interface QuotationItem {
    id?: number;
    quotationId?: number;
    serviceId: number | null;
    serviceName: string;
    tierId?: number | null;
    tierName?: string;
    itemId?: number | null;
    itemName: string;
    itemCategory: string;
    itemPriceUnit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    isRequired: boolean;
    paymentMethod?: PaymentMethod | null;
    sortOrder: number;
}

export interface QuotationServiceConfig {
    id?: number;
    quotationId?: number;
    serviceId: number | null;
    serviceName: string;
    billingType: string;
    selectedTierId?: number | null;
    selectedTierName?: string;
    eventFrequency?: string;
    eventPaymentMethod?: PaymentMethod | null;
    notes?: string;
}

export interface Quotation {
    id: number;
    quotationNumber: string;
    clientId: number;
    clientName?: string;
    title: string;
    contractMonths: number;
    discountPolicyId?: number | null;
    discountApplied: boolean;
    subtotal: number;
    discountAmount: number;
    totalAmount: number;
    monthlyAmount: number;
    notes?: string;
    status: QuotationStatus;
    validUntil?: string;
    createdBy?: number | null;
    createdByName?: string;
    createdAt: string;
    updatedAt: string;
    items: QuotationItem[];
    serviceConfigs: QuotationServiceConfig[];
}

// ===== 계약서 시스템 타입 =====

export type ContractStatus = 'draft' | 'signed' | 'active' | 'expired' | 'terminated';

export interface Contract {
    id: number;
    contractNumber: string;
    quotationId?: number | null;
    clientId: number;
    clientName?: string;
    title: string;
    contractMonths: number;
    startDate?: string;
    endDate?: string;
    subtotal: number;
    discountAmount: number;
    totalAmount: number;
    monthlyAmount: number;
    notes?: string;
    status: ContractStatus;
    signedAt?: string;
    createdBy?: number | null;
    createdByName?: string;
    createdAt: string;
    updatedAt: string;
    quotationNumber?: string;
}

