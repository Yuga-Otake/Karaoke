import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { startAutoUpdate } from './utils/autoUpdate'

startAutoUpdate()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
