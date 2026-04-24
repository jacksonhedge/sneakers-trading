'use client'

import { useState } from 'react'
import { WalletPicker } from './wallet-picker'

interface Props {
  variant?: 'dark' | 'light'
}

export function ConnectWalletButton({ variant = 'dark' }: Props) {
  const [open, setOpen] = useState(false)

  const buttonCls =
    variant === 'light'
      ? 'text-xs tracking-wider font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded border border-amber-300 transition'
      : 'inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-xs font-semibold tracking-wider text-amber-300 ring-1 ring-amber-400/50 backdrop-blur-sm hover:bg-amber-500/20 hover:ring-amber-400 transition'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonCls}>
        {variant === 'light' ? 'Connect Wallet ↗' : 'CONNECT WALLET →'}
      </button>
      {open && <WalletPicker onClose={() => setOpen(false)} />}
    </>
  )
}
