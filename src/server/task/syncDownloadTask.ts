import fs from 'node:fs'
import path from 'node:path'
import * as fileCache from '../fileCache'
import { syncLog } from '@/utils/log4js'
import { getUserSpace } from '@/user'
import { File } from '@/constants'
import { getUserDirname } from '@/user/data'
import { ScheduledTask, TaskExecutionResult } from './types'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SyncDownloadPlaylistConfig {
  enabled: boolean
  lastSyncTime: number | null
  failedSongs: SyncFailedSong[]
}

export interface SyncFailedSong {
  id: string
  name: string
  singer: string
  reason: string
  source?: string
  cover?: string
  interval?: string
  album?: string
}

export interface SyncDownloadData {
  enabled: boolean
  preferredQuality?: string // 歌单同步下载指定音质 ('128k' | '320k' | 'flac' | 'flac24bit' 等，默认 '320k')
  playlists: Record<string, SyncDownloadPlaylistConfig>
  lastSyncTime: number | null
  lastSyncResult: string | null
}

export interface UserData {
  syncDownload?: SyncDownloadData
}

export interface SyncProgressLog {
  time: number
  msg: string
}

export interface SyncProgress {
  isRunning: boolean
  isPaused?: boolean
  startTime: number | null
  currentListId: string
  currentListName: string
  currentSongName: string
  currentSongIndex: number        // 当前歌单内正在下载第几首 (1-based)
  currentListTotalSongs: number   // 当前歌单内需下载总数
  totalSongs: number              // 总计需下载数 (整体)
  overallCurrent: number          // 总计已处理数 (整体)
  successCount: number            // 成功下载数
  addCount: number                // 实际新增/更新下载数
  deleteCount: number             // 删除移除歌曲数
  failCount: number               // 失败数
  log: SyncProgressLog[]          // 最新 100 条
}

type SongResolver = (
  songInfo: any,
  quality: string,
  username: string
) => Promise<{ url: string; quality: string; songInfo?: any }>

// ─────────────────────────────────────────────
// Resolver 注入（由 server.ts 在启动时设置）
// ─────────────────────────────────────────────
let _resolver: SongResolver | null = null
export const setSongResolver = (fn: SongResolver) => {
  _resolver = fn
}

// ─────────────────────────────────────────────
// 运行时进度状态 & 中止控制器（每个用户独立）
// ─────────────────────────────────────────────
const progressMap = new Map<string, SyncProgress>()
const activeAbortControllers = new Map<string, AbortController>()

const getProgress = (username: string): SyncProgress => {
  if (!progressMap.has(username)) {
    progressMap.set(username, {
      isRunning: false,
      isPaused: false,
      startTime: null,
      currentListId: '',
      currentListName: '',
      currentSongName: '',
      currentSongIndex: 0,
      currentListTotalSongs: 0,
      totalSongs: 0,
      overallCurrent: 0,
      successCount: 0,
      addCount: 0,
      deleteCount: 0,
      failCount: 0,
      log: [],
    })
  }
  return progressMap.get(username)!
}

export const cancelUserSync = (username: string): boolean => {
  const controller = activeAbortControllers.get(username)
  if (controller) {
    controller.abort()
    activeAbortControllers.delete(username)
    const progress = getProgress(username)
    progress.isRunning = false
    progress.isPaused = false
    progress.currentSongName = ''
    addLog(progress, '用户已暂停/停止同步任务')
    return true
  }
  const progress = getProgress(username)
  if (progress.isRunning) {
    progress.isRunning = false
    progress.isPaused = false
    progress.currentSongName = ''
    return true
  }
  return false
}

const addLog = (progress: SyncProgress, msg: string) => {
  progress.log.push({ time: Date.now(), msg })
  if (progress.log.length > 100) progress.log.shift()
}

export const getUserSyncProgress = (username: string) => {
  return getProgress(username)
}

export const getAllSyncProgress = () => {
  return Object.fromEntries(progressMap)
}

// ─────────────────────────────────────────────
// data.json 读写管理
// ─────────────────────────────────────────────
const DATA_FILE_NAME = 'data.json'

const getUserDataPath = (username: string) => {
  const userDir = path.join(global.lx.userPath, getUserDirname(username))
  return path.join(userDir, DATA_FILE_NAME)
}

export const loadUserData = (username: string): UserData => {
  const filePath = getUserDataPath(username)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserData
  } catch {
    return {}
  }
}

export const saveUserData = (username: string, data: UserData): void => {
  const filePath = getUserDataPath(username)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = filePath + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, filePath)
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch { }
    throw e
  }
}

export const getSyncDownloadData = (username: string): SyncDownloadData => {
  const data = loadUserData(username)
  return data.syncDownload ?? {
    enabled: false,
    playlists: {},
    lastSyncTime: null,
    lastSyncResult: null,
  }
}

export const saveSyncDownloadData = (username: string, syncData: SyncDownloadData): void => {
  const data = loadUserData(username)
  data.syncDownload = syncData
  saveUserData(username, data)
}

/**
 * 清理 data.json 中已被删除的歌单条目
 */
const cleanupStalePlaylists = (syncData: SyncDownloadData, validListIds: Set<string>): boolean => {
  let changed = false
  for (const id of Object.keys(syncData.playlists)) {
    if (!validListIds.has(id)) {
      delete syncData.playlists[id]
      changed = true
    }
  }
  return changed
}

// ─────────────────────────────────────────────
// 读取同步下载指定的音质（未单独配置则回退到用户首选音质或 320k）
// ─────────────────────────────────────────────
const getPreferredQuality = (username: string): string => {
  try {
    const syncData = getSyncDownloadData(username)
    if (syncData.preferredQuality && typeof syncData.preferredQuality === 'string') {
      return syncData.preferredQuality
    }
    const userSpace = getUserSpace(username)
    const settingsPath = path.join(userSpace.dataManage.userDir, File.userSettingsJSON)
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (settings.preferredQuality && typeof settings.preferredQuality === 'string') {
        return settings.preferredQuality
      }
    }
  } catch { }
  return '320k'
}

// ─────────────────────────────────────────────
// 超时控制工具函数
// ─────────────────────────────────────────────
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
  let timer: NodeJS.Timeout
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    })
  ]).finally(() => {
    clearTimeout(timer)
  })
}

// ─────────────────────────────────────────────
// 核心：将单首歌曲下载到指定 subPath
// ─────────────────────────────────────────────
const CACHE_LOCATION = fileCache.CACHE_ROOTS.DATA
const RESOLVE_TIMEOUT_MS = 25000 // 单曲解析超时 25s
const DOWNLOAD_TIMEOUT_MS = 120000 // 单曲下载超时 120s

export const downloadSongToSubPath = async (
  songInfo: any,
  quality: string,
  username: string,
  subPath: string,
  signal?: AbortSignal,
): Promise<'ok' | 'exists' | Error> => {
  if (!_resolver) return new Error('Sync download resolver not initialized')

  try {
    touchGlobalLock()
    const resolved = await withTimeout(
      _resolver(songInfo, quality, username),
      RESOLVE_TIMEOUT_MS,
      `音源解析超时 (${RESOLVE_TIMEOUT_MS / 1000}s)`
    )
    if (signal?.aborted) return new Error('Aborted')
    if (!resolved?.url) return new Error('No download URL returned')

    // 使用实际解析的 songInfo（可能包含更完整的元数据）
    const finalSongInfo = resolved.songInfo || songInfo
    // 将 subPath 写入 songInfo 的临时字段，供 downloadAndCache 识别
    // downloadAndCache 目前使用 username 下的 music 根目录，
    // 我们通过先创建目录、再传入 subPath 字段的方式实现
    const songInfoWithSubPath = { ...finalSongInfo, __syncSubPath__: subPath }

    // 确保目标子目录存在
    const musicDir = fileCache.getCacheDir(username, true, CACHE_LOCATION)
    const subDir = path.join(musicDir, subPath)
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true })

    touchGlobalLock()

    // 直接调用 downloadAndCache，isOnlyDownload=true 写入 music 目录
    // 增加单曲下载硬超时保护，防止特定网络中断无响应导致全局死锁
    await withTimeout(
      fileCache.downloadAndCache(
        songInfoWithSubPath,
        resolved.url,
        resolved.quality || quality,
        username,
        signal,
        true,   // isOnlyDownload → 写到 music/ 目录
        true,   // cacheLyric
        true,   // embedLyric
        {
          requestedSource: (resolved.songInfo || songInfo).requestedSource || (resolved.songInfo || songInfo).source,
          downloadSource: (resolved.songInfo || songInfo).downloadSource,
          sourceName: (resolved.songInfo || songInfo).sourceName,
        }
      ),
      DOWNLOAD_TIMEOUT_MS,
      `下载歌曲超时 (${DOWNLOAD_TIMEOUT_MS / 1000}s)`
    )

    touchGlobalLock()

    if (signal?.aborted) return new Error('Aborted')

    // 下载完成后将索引中该歌曲的 subPath 更新为目标子目录
    const songId = fileCache.normalizeSongId(finalSongInfo)
    const item = fileCache.indexManager.get(username, songId, 'music', resolved.quality || quality, false, CACHE_LOCATION)
    if (item && (!item.subPath || item.subPath !== subPath)) {
      // 如果文件实际落在根目录，需要移动到 subPath
      const musicRoot = fileCache.getCacheDir(username, true, CACHE_LOCATION)
      const currentFilename = item.filename
      const hasSubDir = currentFilename.includes('/')
      if (!hasSubDir) {
        // 文件在根目录，移动到子目录
        const srcPath = path.join(musicRoot, currentFilename)
        const ext = path.extname(currentFilename)
        const destFilename = path.join(subPath, path.basename(currentFilename)).replace(/\\/g, '/')
        const destPath = path.join(musicRoot, destFilename)

        if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
          fs.renameSync(srcPath, destPath)
          // 同步移动 .lrc 文件
          if (item.lyricFilename) {
            const srcLrc = path.join(musicRoot, item.lyricFilename)
            const destLrc = path.join(musicRoot, path.join(subPath, path.basename(item.lyricFilename)).replace(/\\/g, '/'))
            if (fs.existsSync(srcLrc)) {
              try { fs.renameSync(srcLrc, destLrc) } catch { }
            }
          }
          // 更新索引
          fileCache.indexManager.update(username, {
            ...item,
            filename: destFilename,
            subPath,
            lyricFilename: item.lyricFilename
              ? path.join(subPath, path.basename(item.lyricFilename)).replace(/\\/g, '/')
              : undefined,
          }, 'music', CACHE_LOCATION)
        }
      }
    }

    // 判断是否已存在
    const songKey = fileCache.normalizeSongId(finalSongInfo) + '_' + (resolved.quality || quality)
    const prog = fileCache.cacheProgress.get(songKey)
    return prog?.status === 'exists' ? 'exists' : 'ok'

  } catch (e: any) {
    return e instanceof Error ? e : new Error(String(e))
  }
}

// ─────────────────────────────────────────────
// 重试下载
// ─────────────────────────────────────────────
const downloadWithRetry = async (
  song: any,
  quality: string,
  username: string,
  subPath: string,
  maxRetries: number = 3,
  signal?: AbortSignal,
): Promise<{ status: 'ok' | 'exists' | 'failed'; reason?: string }> => {
  let lastErr: Error | undefined
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) return { status: 'failed', reason: 'Aborted' }
    const result = await downloadSongToSubPath(song, quality, username, subPath, signal)
    if (result === 'ok') return { status: 'ok' }
    if (result === 'exists') return { status: 'exists' }
    lastErr = result instanceof Error ? result : new Error(String(result))
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1000 * attempt)) // 递增等待
    }
  }
  return { status: 'failed', reason: lastErr?.message || '未知错误' }
}

// ─────────────────────────────────────────────
// 获取本地已有歌曲（按 subPath 分组）
// ─────────────────────────────────────────────
const getLocalSongsMap = (username: string, subPath: string): Map<string, fileCache.CacheItem> => {
  const items = fileCache.indexManager.getAll(username, 'music', CACHE_LOCATION)
  const map = new Map<string, fileCache.CacheItem>()
  for (const item of items) {
    if (item.subPath === subPath) {
      map.set(item.id, item)
    }
  }
  return map
}

const getLocalSongIds = (username: string, subPath: string): Set<string> => {
  const items = fileCache.indexManager.getAll(username, 'music', CACHE_LOCATION)
  const ids = new Set<string>()
  for (const item of items) {
    if (item.subPath === subPath) {
      ids.add(item.id)
    }
  }
  return ids
}

/**
 * 删除本地歌曲并更新索引
 */
const deleteLocalSong = (username: string, songId: string, subPath: string): boolean => {
  const items = fileCache.indexManager.getAll(username, 'music', CACHE_LOCATION)
  const toDelete = items.filter(i => i.id === songId && i.subPath === subPath)
  let deleted = false
  for (const item of toDelete) {
    try {
      fileCache.removeCacheFile(item.filename, username, 'music')
      deleted = true
    } catch (e: any) {
      syncLog.warn(`[SyncDownload] 删除文件失败: ${item.filename}: ${e.message}`)
    }
  }
  return deleted
}

// ─────────────────────────────────────────────
// 清理安全文件名（用于生成子目录名）
// ─────────────────────────────────────────────
const sanitizeDirName = (name: string): string => {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80)
}

// ─────────────────────────────────────────────
// 全局运行锁（跨用户共用，带租约与自愈机制，防止死锁与并发）
// ─────────────────────────────────────────────
let globalIsRunning = false
let globalLockTime = 0
const GLOBAL_LOCK_TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟锁租约超时

/**
 * 刷新全局锁心跳
 */
export const touchGlobalLock = () => {
  if (globalIsRunning) {
    globalLockTime = Date.now()
  }
}

/**
 * 对单个用户执行歌单同步下载
 */
const syncUserPlaylists = async (username: string, signal?: AbortSignal, targetPlaylistId?: string) => {
  const progress = getProgress(username)
  if (progress.isRunning) {
    syncLog.info(`[SyncDownload] 用户 ${username} 当前正在同步中，跳过`)
    return
  }

  const syncData = getSyncDownloadData(username)
  if (!syncData.enabled && !targetPlaylistId) return

  const userSpace = getUserSpace(username)
  let listData: any
  try {
    listData = await userSpace.listManage.getListData()
  } catch (e: any) {
    syncLog.warn(`[SyncDownload] 用户 ${username} 获取歌单失败: ${e.message}`)
    return
  }

  if (!listData?.userList?.length) return

  const quality = getPreferredQuality(username)
  const validListIds = new Set<string>(listData.userList.map((l: any) => l.id))

  // 清理已删除的歌单
  const cleaned = cleanupStalePlaylists(syncData, validListIds)
  if (cleaned) saveSyncDownloadData(username, syncData)

  // 只同步开启了同步的歌单（如果指定了 targetPlaylistId，则仅同步该歌单）
  const targetLists = listData.userList.filter((l: any) => {
    if (targetPlaylistId) return l.id === targetPlaylistId
    const cfg = syncData.playlists[l.id]
    return cfg?.enabled === true
  })

  if (targetLists.length === 0) return

  // 预扫描所有需下载和需删除的歌曲
  let overallTotal = 0
  const plans: Array<{
    list: any
    subPath: string
    remoteSongs: any[]
    toDelete: string[]
    localSongsMap: Map<string, fileCache.CacheItem>
  }> = []

  for (const list of targetLists) {
    const subPath = sanitizeDirName(list.name || list.id)
    const remoteSongs: any[] = Array.isArray(list.list) ? list.list : []
    const remoteSongIds = new Set<string>(remoteSongs.map((s: any) => {
      const id = String(s.songmid || s.id || '')
      const src = s.source || 'unknown'
      return id.includes('_') ? id : `${src}_${id}`
    }))
    const localSongsMap = getLocalSongsMap(username, subPath)
    const localSongIds = new Set<string>(localSongsMap.keys())
    const toDelete = Array.from(localSongIds).filter(id => !remoteSongIds.has(id))

    overallTotal += remoteSongs.length
    plans.push({ list, subPath, remoteSongs, toDelete, localSongsMap })
  }

  progress.isRunning = true
  progress.isPaused = false
  progress.startTime = Date.now()
  progress.successCount = 0
  progress.addCount = 0
  progress.deleteCount = 0
  progress.failCount = 0
  progress.totalSongs = overallTotal
  progress.overallCurrent = 0
  progress.currentListId = ''
  progress.currentListName = ''
  progress.currentSongName = ''
  progress.currentSongIndex = 0
  progress.currentListTotalSongs = 0
  progress.log = []
  addLog(progress, `开始同步用户 ${username} 的 ${targetLists.length} 个歌单，总计需同步核对 ${overallTotal} 首歌曲 (目标音质: ${quality})`)

  let totalAdded = 0
  let totalDeleted = 0
  let totalFailed = 0

  try {
    for (const plan of plans) {
      if (signal?.aborted) break
      const { list, subPath, remoteSongs, toDelete, localSongsMap } = plan
      const listCfg = syncData.playlists[list.id] ?? {
        enabled: true, lastSyncTime: null, failedSongs: []
      }

      progress.currentListId = list.id
      progress.currentListName = list.name || list.id
      progress.currentListTotalSongs = remoteSongs.length
      progress.currentSongIndex = 0

      // 删除已移出歌单的歌曲
      for (const id of toDelete) {
        if (signal?.aborted) break
        const deleted = deleteLocalSong(username, id, subPath)
        if (deleted) {
          totalDeleted++
          progress.deleteCount++
        }
        addLog(progress, `  已删除: ${id}`)
      }

      // 同步处理歌单中全部歌曲（对比本地缓存或执行下载）
      listCfg.failedSongs = []
      for (let i = 0; i < remoteSongs.length; i++) {
        if (signal?.aborted) break
        const song = remoteSongs[i]
        const songId = fileCache.normalizeSongId(song)
        const oldExisting = localSongsMap.get(songId)

        progress.currentSongIndex = i + 1
        progress.overallCurrent++
        progress.currentSongName = `${song.name || song.id}${song.singer ? ' - ' + song.singer : ''}`

        const isUpgrade = oldExisting && oldExisting.quality !== quality
        const needDownload = !oldExisting || isUpgrade

        if (!needDownload) {
          // 本地已有且音质相符，直接计入成功
          progress.successCount++
          continue
        }

        addLog(progress, `  [${i + 1}/${remoteSongs.length}] ${isUpgrade ? '更新音质' : '下载'}: ${song.name} - ${song.singer} (${quality})`)
        const result = await downloadWithRetry(song, quality, username, subPath, 3, signal)

        if (result.status === 'ok') {
          // 如果是音质变更重新下载成功，清理旧音质文件
          if (isUpgrade && oldExisting && oldExisting.filename) {
            try {
              fileCache.removeCacheFile(oldExisting.filename, username, 'music')
            } catch { }
          }
          progress.successCount++
          progress.addCount++
          totalAdded++
        } else if (result.status === 'exists') {
          progress.successCount++
        } else {
          progress.failCount++
          totalFailed++
          const reason = result.reason || '未知错误'
          const cover = song.img || song.pic || song.picUrl || song.meta?.picUrl || song.meta?.pic || song.meta?.albumPic || song.meta?.cover || song.album?.picUrl || song.album?.pic || song.album?.img || song.otherSource?.meta?.picUrl || ''
          const interval = song.interval || song.meta?.interval || ''
          const album = song.albumName || song.meta?.albumName || (typeof song.album === 'string' ? song.album : song.album?.name) || ''
          listCfg.failedSongs.push({
            id: fileCache.normalizeSongId(song),
            name: song.name || '',
            singer: song.singer || '',
            reason,
            source: song.source || '',
            cover,
            interval: typeof interval === 'number' ? `${Math.floor(interval / 60)}:${String(Math.floor(interval % 60)).padStart(2, '0')}` : String(interval || ''),
            album,
          })
        }
      }

      listCfg.lastSyncTime = Date.now()
      syncData.playlists[list.id] = listCfg
      saveSyncDownloadData(username, syncData)
    }

    if (signal?.aborted) {
      const resultMsg = `已暂停/终止同步: 增加 ${totalAdded} 首，减少 ${totalDeleted} 首，失败 ${totalFailed} 首`
      addLog(progress, resultMsg)
      syncData.lastSyncResult = resultMsg
      saveSyncDownloadData(username, syncData)
    } else {
      const resultMsg = `同步完成: 增加 ${totalAdded} 首，减少 ${totalDeleted} 首，失败 ${totalFailed} 首`
      addLog(progress, resultMsg)
      syncData.lastSyncTime = Date.now()
      syncData.lastSyncResult = resultMsg
      saveSyncDownloadData(username, syncData)
    }
  } catch (err: any) {
    const errorMsg = `同步过程异常终止: ${err?.message || err}`
    addLog(progress, errorMsg)
    syncData.lastSyncResult = errorMsg
    saveSyncDownloadData(username, syncData)
    syncLog.error(`[SyncDownload] 用户 ${username} 同步执行出错:`, err)
  } finally {
    progress.isRunning = false
    progress.startTime = null
    progress.currentSongName = ''
    syncLog.info(`[SyncDownload] 用户 ${username} ${syncData.lastSyncResult}`)
  }
}

/**
 * 对所有启用了自动下载的用户执行同步
 */
export const syncDownloadForAllUsers = async (signal?: AbortSignal): Promise<{
  processedUsers: number
  totalSuccess: number
  totalAdded: number
  totalDeleted: number
  totalFail: number
}> => {
  const now = Date.now()
  if (globalIsRunning) {
    if (globalLockTime && now - globalLockTime > GLOBAL_LOCK_TIMEOUT_MS) {
      syncLog.warn(`[SyncDownload] 全局同步任务锁定超过 ${GLOBAL_LOCK_TIMEOUT_MS / 60000} 分钟未完成，疑似异常挂起，自动强制释放锁并重新执行`)
      globalIsRunning = false
    } else {
      syncLog.info('[SyncDownload] 全局同步任务正在运行中，跳过本次触发')
      return { processedUsers: 0, totalSuccess: 0, totalAdded: 0, totalDeleted: 0, totalFail: 0 }
    }
  }

  globalIsRunning = true
  globalLockTime = Date.now()

  let processedUsers = 0
  let totalSuccess = 0
  let totalAdded = 0
  let totalDeleted = 0
  let totalFail = 0

  try {
    const users: string[] = []
    if (Array.isArray(global.lx?.config?.users)) {
      for (const u of global.lx.config.users) {
        if (u?.name) {
          // 检查管理员是否为该用户开启了 enableAutoDownload
          const cfg = global.lx.config.users.find((x: any) => x.name === u.name)
          if (cfg?.enableAutoDownload === true) {
            users.push(u.name)
          }
        }
      }
    }

    for (const username of users) {
      if (signal?.aborted) break
      try {
        touchGlobalLock()
        const before = getProgress(username)
        const successBefore = before.successCount
        const addBefore = before.addCount
        const deleteBefore = before.deleteCount
        const failBefore = before.failCount
        await syncUserPlaylists(username, signal)
        const after = getProgress(username)
        totalSuccess += after.successCount - successBefore
        totalAdded += after.addCount - addBefore
        totalDeleted += after.deleteCount - deleteBefore
        totalFail += after.failCount - failBefore
        processedUsers++
      } catch (e: any) {
        syncLog.warn(`[SyncDownload] 处理用户 ${username} 时出错: ${e.message}`)
      }
    }
  } finally {
    globalIsRunning = false
    globalLockTime = 0
  }

  return { processedUsers, totalSuccess, totalAdded, totalDeleted, totalFail }
}

/**
 * 手动触发单个用户的同步（前端调用，可传 playlistId 仅同步单歌单）
 */
export const triggerUserSync = async (username: string, playlistId?: string): Promise<{ queued: boolean; message: string }> => {
  const progress = getProgress(username)
  if (progress.isRunning) {
    return { queued: false, message: '同步任务正在进行中，请稍候' }
  }
  const controller = new AbortController()
  activeAbortControllers.set(username, controller)
  // 异步执行，不阻塞请求
  void syncUserPlaylists(username, controller.signal, playlistId).finally(() => {
    activeAbortControllers.delete(username)
  })
  return { queued: true, message: playlistId ? '歌单同步任务已启动' : '同步任务已启动' }
}

/**
 * 创建后台调度任务对象（供 scheduler 调度中心注册）
 */
export const createSyncDownloadTask = (): ScheduledTask => {
  return {
    id: 'sync_download_task',
    name: '歌单歌曲同步下载',
    intervalMs: 0,
    enabled: true,
    isRunning: false,
    run: async (): Promise<TaskExecutionResult> => {
      const startTime = Date.now()
      try {
        const result = await syncDownloadForAllUsers()
        return {
          taskId: 'sync_download_task',
          timestamp: startTime,
          success: true,
          message: `已同步 ${result.processedUsers} 个用户: 增加 ${result.totalAdded} 首，减少 ${result.totalDeleted} 首，失败 ${result.totalFail} 首`,
          details: result
        }
      } catch (err: any) {
        return {
          taskId: 'sync_download_task',
          timestamp: startTime,
          success: false,
          message: `同步下载失败: ${err.message}`
        }
      }
    }
  }
}
