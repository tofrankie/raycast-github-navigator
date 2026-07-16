import { defineConfig } from 'eslint/config';
import raycastConfig from '@raycast/eslint-config';
import packageJsonSortConfig from '@tofrankie/eslint/raycast';

export default defineConfig([...raycastConfig, packageJsonSortConfig, { ignores: ['raycast-env.d.ts'] }]);
