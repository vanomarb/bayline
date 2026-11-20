import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { captureAt } from './build/capture.ts'
import { PARTIAL_FILES, includePartials, type PartialName } from './build/partials.ts'
import { LOCAL_SITE_URL, SITE_BASE, checkSiteUrl, leftoverPlaceholders } from './app/lib/site.ts'

const NODE_MODULES = fileURLToPath(new URL('./node_modules/', import.meta.url))
const ICONS = `${NODE_MODULES}@phosphor-icons/core/assets/`
const WEIGHTS = new Set(['regular', 'bold', 'fill'])
const COMPONENTS = new URL('./app/components/', import.meta.url)
const read = (name: PartialName) => readFileSync(new URL(PARTIAL_FILES[name], COMPONENTS), 'utf8')

/** Icons are inlined at dev and build time, so no icon script ships and nothing shifts on load. */
function partialsAndIcons(): Plugin {
  const cache = new Map<string, string>()
  const load = (weight: string, name: string): string => {
    const file = weight === 'regular' ? `${weight}/${name}.svg` : `${weight}/${name}-${weight}.svg`
    let svg = cache.get(file)
    if (svg === undefined) {
      svg = readFileSync(ICONS + file, 'utf8').trim()
      cache.set(file, svg)
    }
    return svg
  }
  return {
    name: 'bayline:partials-and-icons',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return includePartials(html, read, SITE_BASE).replace(/<i\s+data-icon="([a-z0-9-]+)"([^>]*)><\/i>/g, (_tag, name: string, rest: string) => {
          const weight = rest.match(/data-weight="([a-z]+)"/)?.[1] ?? 'bold'
          if (!WEIGHTS.has(weight)) throw new Error(`Unknown icon weight "${weight}" for ${name}`)
          const extra = rest.match(/class="([^"]*)"/)?.[1]
          const className = extra ? `icon ${extra}` : 'icon'
          return load(weight, name).replace('<svg ', `<svg class="${className}" aria-hidden="true" focusable="false" `)
        })
      },
    },
  }
}

/* The heads preload fonts from /node_modules/, which sits outside the Vite root (app/): point those URLs at the real folder. */
function nodeModulesUrls(): Plugin {
  return {
    name: 'node-modules-urls',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, { filename, server }) => html.replaceAll('"/node_modules/', `"${server ? `/@fs${NODE_MODULES}` : `${relative(dirname(filename), NODE_MODULES)}/`}`),
    },
  }
}

function noPlaceholdersLeft(): Plugin {
  return {
    name: 'bayline:no-placeholders-left',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { filename }) {
        const left = leftoverPlaceholders(html)
        if (left.length > 0) throw new Error(`${filename} still has ${left.join(', ')} after the build. Check its spelling, and that .env sets it.`)
        return html
      },
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Without the variable or a .env, the local preview address; the Pages workflow passes the published one.
  if (env.VITE_SITE_URL === undefined) process.env.VITE_SITE_URL = env.VITE_SITE_URL = LOCAL_SITE_URL
  if (command === 'build') checkSiteUrl(env.VITE_SITE_URL)
  return {
  root: 'app',
  publicDir: '../public',
  envDir: '..',
  base: SITE_BASE,
  plugins: [partialsAndIcons(), nodeModulesUrls(), tailwindcss(), noPlaceholdersLeft()],
  define: { __CAPTURE_AT__: JSON.stringify(captureAt(mode, env.VITE_CAPTURE_AT)) },
  build: {
    outDir: mode === 'capture' ? '../dist-capture' : '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // Tailwind v4's browser floor: all read oklch(), so the minifier adds no hex or lab() fallbacks.
    cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
    rolldownOptions: {
      input: {
        main: 'index.html',
        services: 'services/index.html',
        plans: 'plans/index.html',
        visit: 'visit/index.html',
        location: 'location/index.html',
        account: 'account/index.html',
        basket: 'basket/index.html',
        about: 'about/index.html',
        contact: 'contact/index.html',
        terms: 'terms/index.html',
        privacy: 'privacy/index.html',
        cookies: 'cookies/index.html',
        accessibility: 'accessibility/index.html',
        notFound: '404.html',
      },
    },
  },
}
})
