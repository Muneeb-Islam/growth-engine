/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow the demo landing pages to render product images pulled straight
    // from Gymshark's and Alphalete's own Shopify CDN URLs.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
    ],
  },
};

module.exports = nextConfig;
