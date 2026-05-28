import { Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Home, ShoppingBag, PlusCircle, X, Gift } from 'lucide-react'

const navItems = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/shop', label: 'Shop', icon: ShoppingBag },
  { path: '/lucky-wheel', label: 'Daily reward', icon: Gift },
  
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation()

  useEffect(() => {
    onClose()
  }, [location.pathname])

  const isCreateActive = location.pathname === '/create'

  const sidebarContent = (
    <>
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 px-4 md:px-5 py-5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" className='size-8 text-[#7C3AED]'>
          <defs>
            <mask id="face-holes-sm">
              <circle cx="12" cy="13.2" r="7.2" fill="white" />

              <circle cx="9" cy="12" r="0.96" fill="black" />
              <circle cx="15" cy="12" r="0.96" fill="black" />

              <ellipse cx="12" cy="15.6" rx="1.68" ry="2.64" fill="black" />
            </mask>
          </defs>

          <circle cx="6" cy="7.8" r="3.6" fill="currentColor"/>
          <circle cx="18" cy="7.8" r="3.6" fill="currentColor"/>

          <circle cx="12" cy="13.2" r="7.2" fill="currentColor" mask="url(#face-holes-sm)" />
        </svg>
        <span className="text-xl font-bold text-white">KoalaPad</span>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 mt-2 px-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-violet-400'
                  : 'text-gray-100 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              <item.icon size={20} className={isActive ? 'text-violet-400' : ''} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Create Coin button */}
      <div className="px-3 mt-4">
        <Link
          to="/create"
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            isCreateActive
              ? 'bg-violet-600 text-white shadow-[0_0_16px_rgba(139,92,246,0.5)]'
              : 'bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.6)]'
          }`}
        >
          <PlusCircle size={20} />
          Create Coin
        </Link>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-black border-r border-gray-800 z-50">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      <div className="md:hidden" aria-hidden={!isOpen}>
        <div
          onClick={onClose}
          className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ease-in-out ${
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        />
        <aside
          className="fixed inset-y-0 left-0 w-56 bg-black border-r border-gray-800 z-50 transition-transform duration-300 ease-in-out"
          style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-4 p-1 text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          {sidebarContent}
        </aside>
      </div>
    </>
  )
}
