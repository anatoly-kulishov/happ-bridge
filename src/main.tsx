import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

if (import.meta.env.DEV) {
  const { installDevMock } = await import('./dev-mock')
  installDevMock()
}

// No StrictMode in prod path — avoids extra work on weak devices if someone
// enables it later; DevTools still fine without double-invoke.
createRoot(document.getElementById('root')!).render(<App />)
