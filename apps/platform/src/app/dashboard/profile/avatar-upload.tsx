'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { avatarGradientClass, avatarRingClass } from '@/lib/avatar-defaults'

// Avatar uploader for /dashboard/profile.
//
// Flow:
//   1. User picks a file from disk (image/* + ≤2MB)
//   2. We resize it to 256×256 in a canvas (square crop centered) so
//      the topbar / sidebar / profile renderers all get a consistent
//      asset and the network payload stays small
//   3. Upload the resized JPEG straight to Supabase Storage at
//      `<auth.uid>/avatar.jpg` via the browser supabase client (the
//      bucket's RLS lets the user write only to their own folder)
//   4. Hit POST /api/profile/avatar with the resulting public URL so
//      the server persists waitlist.avatar_url
//   5. router.refresh() picks up the new URL in the next server render
//      so the topbar avatar updates without a full reload

interface Props {
  initial: string                       // Fallback letter for the empty state
  currentUrl: string | null
  avatarEmoji: string | null            // Random emoji assigned at signup
  avatarColor: string | null            // Color key from AVATAR_COLOR_KEYS
  authUserId: string                    // auth.users.id — used as the storage folder
}

const MAX_BYTES = 2 * 1024 * 1024 // matches the bucket's file_size_limit

export function AvatarUpload({
  initial,
  currentUrl,
  avatarEmoji,
  avatarColor,
  authUserId,
}: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl)

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset so picking the same file twice still fires
    if (!file.type.startsWith('image/')) {
      setError('Pick an image file (PNG, JPEG, WebP, or GIF).')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB; max 2MB.`)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const blob = await resizeToSquare(file, 256)
      const url = await uploadToStorage(blob, authUserId)
      // Save the URL on waitlist row.
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      }
      setPreviewUrl(url)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeAvatar() {
    if (!confirm('Remove your profile picture?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPreviewUrl(null)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fallback = avatarEmoji && avatarEmoji.length > 0 ? avatarEmoji : initial
  const gradient = avatarGradientClass(avatarColor)
  const ring = avatarRingClass(avatarColor).replace('ring-', 'ring-2 ring-')

  return (
    <div className="flex items-center gap-4">
      <div
        className={`relative w-20 h-20 rounded-full overflow-hidden ${ring} shadow-md shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Profile"
            width={80}
            height={80}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <span className="text-white text-3xl font-bold leading-none">{fallback}</span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <span
              className="inline-block w-6 h-6 rounded-full border-2 border-white/40 border-t-white animate-spin"
              aria-hidden
            />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={pickFile}
          className="hidden"
          disabled={busy}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-full bg-stone-900 hover:bg-stone-800 text-white px-3.5 py-1.5 text-xs font-semibold tracking-wider transition disabled:opacity-50"
          >
            {previewUrl ? 'CHANGE PHOTO' : 'UPLOAD PHOTO'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={removeAvatar}
              disabled={busy}
              className="text-xs text-stone-500 hover:text-red-700 transition disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <div className="text-[11px] text-stone-500 mt-1.5">
          PNG / JPEG / WebP / GIF · max 2MB · auto-cropped to a square
        </div>
        {error && (
          <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Resize + center-crop a user-supplied image to exactly N×N pixels
 * encoded as JPEG (quality 0.88). Smaller wire payload than re-uploading
 * a 4K phone photo, and guarantees every consumer of avatar_url gets a
 * square asset they don't have to crop again.
 */
async function resizeToSquare(file: File, size: number): Promise<Blob> {
  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)
  const minSide = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = (img.naturalWidth - minSide) / 2
  const sy = (img.naturalHeight - minSide) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encode failed'))),
      'image/jpeg',
      0.88,
    )
  })
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image decode failed'))
    img.src = src
  })
}

async function uploadToStorage(blob: Blob, authUserId: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Supabase env vars missing — cannot upload')
  }
  const supabase = createBrowserClient(url, anon)
  // Cache-bust each upload by appending the timestamp — Supabase caches
  // public objects for ~1h by default and we want the new pic to show
  // immediately when the user uploads a replacement.
  const path = `${authUserId}/avatar-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) {
    throw new Error(error.message)
  }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}
