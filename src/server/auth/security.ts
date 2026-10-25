import fs from 'node:fs'
import path from 'node:path'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import http from 'node:http'
import https from 'node:https'

export const normalizeSourceOwner = (name?: string): string => {
  if (!name || ['open', '_open', 'default'].includes(name)) return 'open'
  if (typeof name !== 'string' || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
    throw new Error('Invalid source owner')
  }
  return name
}

export const resolveContainedPath = (root: string, name: string): string => {
  const base = path.resolve(root)
  const target = path.resolve(base, name)
  const contains = (parent: string, child: string) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep)
  if (!contains(base, target)) throw new Error('Path traversal detected')
  // Check the nearest existing ancestor as well, including symlinks on write paths.
  let ancestor = target
  while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor)
  if (fs.existsSync(base) && !contains(fs.realpathSync(base), fs.realpathSync(ancestor))) {
    throw new Error('Path traversal detected')
  }
  return target
}

export const parseCookies = (header?: string): Record<string, string> => {
  const cookies: Record<string, string> = Object.create(null)
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const key = part.slice(0, index).trim()
    if (Object.hasOwn(cookies, key)) continue
    try { cookies[key] = decodeURIComponent(part.slice(index + 1).trim()) } catch { /* ignore malformed cookies */ }
  }
  return cookies
}

export const isPublicAddress = (address: string): boolean => {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase()
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && [0, 2].includes(c)) ||
      (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  // Only globally routable IPv6; exclude transition and documentation networks.
  return isIP(ip) === 6 && /^[23]/.test(ip) && !/^2001:(?:db8:|0:|2:)/.test(ip) && !ip.startsWith('2002:')
}

export const resolvePublicUrl = async (input: string) => {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid upstream URL')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw Object.assign(new Error('Private upstream addresses are not allowed'), {
      code: 'ERR_PRIVATE_UPSTREAM', hostname, addresses: addresses.map(item => item.address),
    })
  }
  return { url, address: addresses[0].address, family: addresses[0].family }
}

// Artwork embedded by the download proxy must obey the same network boundary as audio.
export const fetchPublicBuffer = async (input: string, maxBytes = 10 * 1024 * 1024, redirects = 0): Promise<Buffer> => {
  if (redirects > 5) throw new Error('Too many redirects')
  const { url, address, family } = await resolvePublicUrl(input)
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const request = client.get(url, {
      agent: false,
      lookup: ((_host: string, options: any, callback: any) => options.all
        ? callback(null, [{ address, family }]) : callback(null, address, family)) as any,
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        clearTimeout(timer)
        response.destroy()
        fetchPublicBuffer(new URL(response.headers.location, url).href, maxBytes, redirects + 1).then(resolve, reject)
        return
      }
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy(); clearTimeout(timer); reject(new Error('Artwork fetch failed')); return
      }
      const chunks: Buffer[] = []
      let received = 0
      response.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (received > maxBytes) request.destroy(new Error('Artwork exceeds size limit'))
        else chunks.push(chunk)
      })
      response.once('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)) })
      response.once('error', error => { clearTimeout(timer); reject(error) })
    })
    const timer = setTimeout(() => request.destroy(new Error('Artwork request timeout')), 30000)
    request.once('error', error => { clearTimeout(timer); reject(error) })
  })
}
