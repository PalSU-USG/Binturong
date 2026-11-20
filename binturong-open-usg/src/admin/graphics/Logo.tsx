import Image from 'next/image'
import React from 'react'

export default function Logo() {
  return (
    <Image
      alt="University Student Government, Palawan State University"
      height={80}
      priority
      src="/brand/usg-emblem.png"
      width={100}
    />
  )
}
