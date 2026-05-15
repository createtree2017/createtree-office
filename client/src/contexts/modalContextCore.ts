import { createContext, ReactNode } from 'react';

export interface ModalContextType {
    openModal: (content: ReactNode) => void;
    closeModal: () => void;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);
