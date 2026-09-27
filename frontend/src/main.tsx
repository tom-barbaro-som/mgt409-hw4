import '@fontsource-variable/open-sans'
// Global styles load before App so component stylesheets can override them.
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import AssistantResultsProvider from './assistant/AssistantResultsProvider.tsx'
import AuthProvider from './auth/AuthProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AssistantResultsProvider>
          <App />
        </AssistantResultsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
