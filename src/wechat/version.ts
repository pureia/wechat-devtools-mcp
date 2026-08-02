import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackageJson {
  name: string;
  version: string;
}

const pkg = require('../package.json') as PackageJson;

export const PKG_NAME = pkg.name;
export const SERVER_VERSION = pkg.version ?? '0.0.0';
