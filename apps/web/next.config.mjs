/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // NextTypesPlugin throws ENOENT on src/app via fs.promises.readdir, causing
    // its tapAsync callback to never call webpack's done callback, permanently
    // hanging compilation. This plugin only generates .d.ts files — safe to remove.
    config.plugins = config.plugins.filter(
      (p) => p?.constructor?.name !== 'NextTypesPlugin'
    );
    return config;
  },
};

export default nextConfig;