import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Sneakers Terminal — A personal trading terminal for the college user.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const logo = await readFile(join(process.cwd(), 'public/logo.png'))
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '64px',
          position: 'relative',
          background:
            'linear-gradient(135deg, #0a1f13 0%, #04100a 55%, #000 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'radial-gradient(circle at 8% 15%, rgba(0, 200, 5, 0.28), transparent 45%)',
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={380}
          height={380}
          alt=""
          style={{
            marginRight: 48,
            zIndex: 1,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
            }}
          >
            A personal trading
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
            }}
          >
            terminal for the
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: '#00c805',
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
            }}
          >
            college user.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  )
}
