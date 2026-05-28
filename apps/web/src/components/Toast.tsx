import { motion, AnimatePresence } from 'framer-motion'
import { FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

export interface ToastState {
  message: string
  type: 'success' | 'error'
}

interface ToastProps {
  toast: ToastState | null
}

export function showToastFor(
  setter: React.Dispatch<React.SetStateAction<ToastState | null>>,
  message: string,
  type: ToastState['type'],
  duration = 3500,
) {
  setter({ message, type })
  setTimeout(() => setter(null), duration)
}

export default function Toast({ toast }: ToastProps) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="toast"
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="fixed top-24 inset-x-0 z-[120] flex justify-center pointer-events-none px-4"
        >
          <div
            className={`pointer-events-auto relative flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl border backdrop-blur-md max-w-[92vw] ${
              toast.type === 'success'
                ? 'bg-gray-900/90 border-violet-500/40 text-violet-100 shadow-violet-900/40'
                : 'bg-gray-900/90 border-red-500/40 text-red-100 shadow-red-900/40'
            }`}
          >
            <span
              aria-hidden
              className={`absolute inset-0 rounded-2xl pointer-events-none ${
                toast.type === 'success'
                  ? 'bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-transparent'
                  : 'bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent'
              }`}
            />
            <span
              className={`relative flex items-center justify-center w-7 h-7 rounded-full ${
                toast.type === 'success'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'bg-red-500/20 text-red-300'
              }`}
            >
              {toast.type === 'success' ? <FiCheckCircle size={16} /> : <FiAlertCircle size={16} />}
            </span>
            <span className="relative">{toast.message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
