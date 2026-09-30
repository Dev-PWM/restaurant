/** Tailwind v3 build for the MasaFlow screens. Run `npm run build:css` after changing classes. */
module.exports = {
  // Class names inside <script> template strings are picked up too, as long as they are written in full.
  content: ['./apps/html/*.html', './assets/*.js'],
  theme: {
    extend: {
      colors: {
        brand: { orange: '#EA580C', stone: '#F9F8F6', obsidian: '#1C1917' }
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
};
