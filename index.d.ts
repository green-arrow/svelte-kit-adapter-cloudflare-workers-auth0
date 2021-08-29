import { Adapter } from '@sveltejs/kit';
import { BuildOptions } from 'esbuild';

interface AdapterOptions {
  protectedRoutes?: string[];
  esbuild?: (options: BuildOptions) => Promise<BuildOptions> | BuildOptions;
}

declare function plugin(options?: AdapterOptions): Adapter;
export = plugin;
