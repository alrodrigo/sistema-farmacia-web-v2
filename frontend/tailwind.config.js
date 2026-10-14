/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // En v4 con @import 'tailwindcss', NO uses theme.extend
  // Todo va en @theme en index.css
}