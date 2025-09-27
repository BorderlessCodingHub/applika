'use client'

import { useState } from 'react'
import AddApplicationModal from './AddApplicationModal'

export default function SearchApplications() {
  const [modalOpen, setModalOpen] = useState(false)

  const platforms = [
    { id: '1', name: 'LinkedIn' },
    { id: '2', name: 'Indeed' },
    { id: '3', name: 'Stack Overflow' }
  ]

  const handleSubmit = (formData: Record<string, any>) => {
    console.log('New application submitted:', formData)
    setModalOpen(false)
  }

  return (
    <>
      <div className="
        backdrop-blur-xl bg-white/5 border border-white/20 
        rounded-2xl p-8 my-4 shadow-[0_8px_32px_rgba(0,0,0,0.1)]
      ">
        <div className="flex justify-between items-center">
          {/* Search Input Section */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search applications..."
              className="
                flex-1 px-4 py-3 text-white text-sm
                bg-white/10 border border-white/20 rounded-lg
                backdrop-blur-sm transition-all duration-300
                placeholder-white/60
                focus:outline-none focus:border-white/40
                focus:bg-white/15 focus:shadow-[0_4px_12px_rgba(0,0,0,0.1)]
              "
            />
          </div>

          {/* Add New Application Button */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="
                flex items-center gap-2 font-semibold
                bg-emerald-400/80 border border-emerald-600 text-black
                px-6 py-3 rounded-lg cursor-pointer
                backdrop-blur-sm transition-all duration-300
                hover:bg-emerald-400 hover:-translate-y-0.5
                hover:shadow-[0_4px_12px_rgba(39,174,96,0.3)]
              "
            >
              <i className="fa-solid fa-plus" />
              Add Application
            </button>
          </div>
        </div>
      </div>

      {/* Add Application Modal */}
      <AddApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        platforms={platforms}
        onSubmit={handleSubmit}
      />
    </>
  )
}
