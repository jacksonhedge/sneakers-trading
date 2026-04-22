'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function EmailLookupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!email.trim()) return
        router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`)
      }}
      className="flex gap-2"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@firm.com"
        className="flex-1 bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 placeholder:text-white/40 transition"
      />
      <button
        type="submit"
        className="border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 transition"
      >
        LOOK UP
      </button>
    </form>
  )
}
