import type { Config } from 'tailwindcss';
const config: Config = { content: ['./src/**/*.{ts,tsx}'], theme: { extend: { colors: { ink:'#0f172a', gold:'#c7a252', soft:'#f7f3ea' } } }, plugins: [] };
export default config;
