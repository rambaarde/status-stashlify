import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({
	baseDirectory: __dirname,
})

/**
 * Flat ESLint config for the standalone status site.
 */
const eslintConfig = [...compat.extends('next/core-web-vitals')]

export default eslintConfig
