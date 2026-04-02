import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ModalProvider } from './contexts/ModalContext.tsx';
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ModalProvider>
                    <App />
                </ModalProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>,
)
