/**
 * 歌手信息助手
 * 支持从 TX (QQ音乐) 和 WY (网易云音乐) 源获取歌手详细信息
 */

// @ts-ignore
import musicSdkRaw from '@/modules/utils/musicSdk/index.js'
const musicSdk = musicSdkRaw as any

export interface SingerDetail {
    name: string
    mid: string
    source: 'tx' | 'wy'
    pic: string
    desc: string
}

const singerCache = new Map<string, SingerDetail>()

// 失败短缓存：音源搜索接口抖动时避免被连环重打（连环失败还会把自己打进限流）。
// 命中后 60s 内直接返回 null，过期自动重试。
const failCache = new Map<string, number>()
const FAIL_TTL = 60 * 1000

/** 名称归一：去空白/常见标点/全半角干扰 + 小写。简繁差异("黄霄云"↔"黄霄雲")交给相似度兜底 */
function normalizeName(name: string): string {
    return String(name || '')
        .replace(/[\s\u3000·・.。,，、\-—_()（）[\]【】'"“”‘’]/g, '')
        .toLowerCase()
}

/**
 * 名字相似度(0~1)：以较长串为分母统计较短串字符的命中率（允许乱序），
 * 用于替代 "name === singerName" 的严格相等——简繁/别名/后缀("黄霄云" vs "黄霄雲的人")都能给出分数。
 */
function nameSimilarity(a: string, b: string): number {
    const x = normalizeName(a)
    const y = normalizeName(b)
    if (!x || !y) return 0
    if (x === y) return 1
    const short = x.length <= y.length ? x : y
    const long = x.length <= y.length ? y : x
    if (long.includes(short)) return short.length / long.length
    const chars = long.split('')
    const used = new Array<boolean>(chars.length).fill(false)
    let hit = 0
    for (const ch of short) {
        const idx = chars.findIndex((c, i) => !used[i] && c === ch)
        if (idx >= 0) {
            used[idx] = true
            hit++
        }
    }
    return hit / long.length
}

/** 从候选列表里挑最贴近搜索词的歌手；完全相同优先，其次相似度最高，最后退回第一条 */
function pickBestSinger(list: any[], name: string): { item: any, score: number } | null {
    if (!Array.isArray(list) || list.length === 0) return null
    const target = normalizeName(name)
    let best = list[0]
    let bestScore = -1
    for (const item of list) {
        const n = String(item?.name || '')
        let score = nameSimilarity(name, n)
        if (target && normalizeName(n) === target) score += 1 // 归一后完全相等，最高优先
        if (score > bestScore) {
            bestScore = score
            best = item
        }
    }
    return { item: best, score: bestScore }
}

/** 取配置里的源顺序，过滤掉压根没实现歌手搜索的源 */
function resolveSourcePriority(sourcePriority?: Array<'tx' | 'wy'>): string[] {
    let configured: any = sourcePriority
    if (!configured || !configured.length) {
        configured = (global.lx as any)?.config?.['singer.sourcePriority']
    }
    const list: string[] = Array.isArray(configured) && configured.length ? [...configured] : ['tx', 'wy']
    const seen = new Set<string>()
    return list.filter(s => {
        if (!s || seen.has(s)) return false
        seen.add(s)
        return Boolean(musicSdk[s]?.extendSearch?.searchSinger)
    })
}

/**
 * 根据歌手名称检索其在指定源或最优源的 MID
 */
export async function getSingerMid(singerName: string, sourcePriority?: Array<'tx' | 'wy'>): Promise<string | null> {
    const detail = await getSingerDetail(singerName, sourcePriority)
    return detail?.mid || null
}

/**
 * 获取歌手照片链接
 */
export async function getSingerPic(singerName: string, sourcePriority?: Array<'tx' | 'wy'>): Promise<string | null> {
    const detail = await getSingerDetail(singerName, sourcePriority)
    return detail?.pic || null
}

/**
 * 获取歌手详细信息
 * @param singerName 歌手名
 * @param sourcePriority 优选顺序，默认从全局配置获取
 */
export async function getSingerDetail(singerName: string, sourcePriority?: Array<'tx' | 'wy'>): Promise<SingerDetail | null> {
    const priority = resolveSourcePriority(sourcePriority)
    const cacheKey = `${singerName}_${priority.join('_')}`

    const cached = singerCache.get(cacheKey)
    if (cached) return cached

    const failedAt = failCache.get(cacheKey)
    if (failedAt && Date.now() - failedAt < FAIL_TTL) {
        return null
    }
    if (!priority.length) {
        console.warn(`[SingerUtils] 歌手「${singerName}」寻址失败：没有任何可用源实现了 searchSinger`)
        return null
    }

    for (const source of priority) {
        const started = Date.now()
        try {
            const sdk = musicSdk[source]
            const searchResult = await sdk.extendSearch.searchSinger(singerName, 1, 5)
            const elapsed = Date.now() - started
            const singerList: any[] = searchResult?.list || []

            if (singerList.length === 0) {
                console.warn(`[SingerUtils] ${source} 搜索歌手「${singerName}」返回 0 条 (${elapsed}ms)`)
                continue
            }

            const picked = pickBestSinger(singerList, singerName)
            const matched = picked?.item
            const mid = matched ? String(matched.mid || matched.id || '') : ''
            if (!mid) {
                console.warn(`[SingerUtils] ${source} 搜索歌手「${singerName}」命中 ${singerList.length} 条但候选无可用 mid`)
                continue
            }

            console.log(`[SingerUtils] ${source} 寻址「${singerName}」→「${matched.name}」(mid=${mid}, 相似度=${(picked?.score ?? 0).toFixed(2)}, 候选=${singerList.length}, ${elapsed}ms)`)

            let desc = matched.alias?.[0] || ''
            let pic = matched.picUrl || matched.img || matched.avatar || ''

            if (sdk.extendDetail?.getArtistDetail) {
                const detail = await sdk.extendDetail.getArtistDetail(mid).catch(() => null)
                if (detail) {
                    desc = detail.desc || desc
                    pic = detail.avatar || detail.pic || pic
                }
            }

            // 兜底补全头像 (TX 特有规则)
            if (!pic && source === 'tx' && mid) {
                pic = `https://y.gtimg.cn/music/photo_new/T001R500x500M000${mid}.jpg`
            }

            const detail: SingerDetail = {
                name: singerName,
                mid,
                source: source as 'tx' | 'wy',
                pic,
                desc,
            }

            singerCache.set(cacheKey, detail)
            failCache.delete(cacheKey)
            return detail

        } catch (err: any) {
            console.warn(`[SingerUtils] 从 ${source} 获取歌手 [${singerName}] 失败 (${Date.now() - started}ms):`, err?.message || err)
            continue
        }
    }

    failCache.set(cacheKey, Date.now())
    console.warn(`[SingerUtils] 歌手「${singerName}」在 ${priority.join('/')} 均寻址失败，${FAIL_TTL / 1000}s 内不再重试`)
    return null
}
