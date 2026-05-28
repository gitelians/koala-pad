import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { QuestProvider } from './context/QuestContext'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import AirdropPopup from './components/AirdropPopup'
import ClaimableAirdropPopup from './components/ClaimableAirdropPopup'
import Home from './pages/Home'
import CreateCoin from './pages/CreateToken'
import Token from './pages/Token'
import Profile from './pages/Profile'
import Shop from './pages/Shop'
import LuckyWheel from './pages/LuckyWheel'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <AuthProvider>
    <QuestProvider>
    <BrowserRouter
      future={{
        // Opt in to v7 behaviour early — wraps state updates in
        // React.startTransition (concurrent-safe) and changes splat-route
        // resolution. We don't use splat routes, so the second flag is a
        // no-op for this app. Both are stable in v6.21+ and silence the
        // dev-only future-flag warnings.
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <div className="min-h-screen bg-black text-gray-100">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <AirdropPopup />
        <ClaimableAirdropPopup />

        <div className="md:ml-60 flex flex-col min-h-screen">
          <div className="sticky top-4 md:top-0 z-40 md:px-0 px-3 md:pt-0">
            <Header onMenuToggle={() => setSidebarOpen(prev => !prev)} />
          </div>
          <main className="w-full px-3 py-4 md:px-5 md:py-6 flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateCoin />} />
              <Route path="/token/:address" element={<Token />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:walletAddress" element={<Profile />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/lucky-wheel" element={<LuckyWheel />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
    </QuestProvider>
    </AuthProvider>
  )
}