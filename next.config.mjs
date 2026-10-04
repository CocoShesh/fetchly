/** @type {import('next').NextConfig} */
const nextConfig = { output: process.env.VERCEL ? undefined : 'standalone', images: { unoptimized: true } }
export default nextConfig
