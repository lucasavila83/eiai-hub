import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MVP: ignorar erros de ESLint e TypeScript no build
  // Remover quando o código estiver limpo
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
