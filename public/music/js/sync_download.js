/**
 * sync_download.js
 * 同步下载面板 - 独立模块，低耦合
 * 通过 /api/user/sync-download/* 接口与后端通信
 */
; (function () {
  'use strict'

  // ─────────────────────────────────────────────
  // 工具函数
  // ─────────────────────────────────────────────
  const $ = id => document.getElementById(id)

  const formatTime = ts => {
    if (!ts) return '—'
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const authHeaders = () => {
    const h = { 'Content-Type': 'application/json' }
    if (typeof window.getUserAuthHeaders === 'function') {
      Object.assign(h, window.getUserAuthHeaders())
    }
    const token = localStorage.getItem('lx_user_token') || sessionStorage.getItem('lx_user_token') || ''
    if (token && !h['x-user-token']) h['x-user-token'] = token
    const user = localStorage.getItem('lx_sync_user') || ''
    if (user && user !== '_open' && !h['x-user-name']) h['x-user-name'] = user
    const adminPass = localStorage.getItem('lx_admin_password') || ''
    if (adminPass && !h['x-frontend-auth']) h['x-frontend-auth'] = adminPass
    return h
  }

  const apiFetch = async (path, options = {}) => {
    const res = await fetch(path, {
      headers: authHeaders(),
      ...options,
    })
    return res.json()
  }

  const _esc = str => {
    if (str === null || str === undefined) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  const getSourceBadge = (source, isNetwork) => {
    if (!isNetwork && !source) return ''
    const map = {
      wy: { name: '网易云', class: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
      tx: { name: 'QQ音乐', class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
      kg: { name: '酷狗', class: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
      kw: { name: '酷我', class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
      mg: { name: '咪咕', class: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20' }
    }
    const conf = (source && map[source]) || { name: 'lxserver', class: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' }
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${conf.class}">${conf.name}</span>`
  }

  // ─────────────────────────────────────────────
  // 状态
  // ─────────────────────────────────────────────
  let _pollTimer = null
  let _wasRunning = false
  let _currentData = null   // 上一次 status 响应

  // ─────────────────────────────────────────────
  // 面板控制
  // ─────────────────────────────────────────────
  const open = async () => {
    const modal = $('sync-download-modal')
    if (!modal) return
    modal.classList.remove('hidden')
    document.body.style.overflow = 'hidden'
    $('sd-playlist-loading')?.classList.remove('hidden')
    await loadStatus()
    startPolling()
  }

  const close = () => {
    const modal = $('sync-download-modal')
    if (!modal) return
    modal.classList.add('hidden')
    document.body.style.overflow = ''
    stopPolling()
  }

  // ─────────────────────────────────────────────
  // 加载状态（首次打开 + 定时刷新静态数据）
  // ─────────────────────────────────────────────
  const loadStatus = async () => {
    try {
      const resp = await apiFetch('/api/user/sync-download/status')
      if (!resp || !resp.success) {
        $('sd-playlist-loading')?.classList.add('hidden')
        const list = $('sd-playlist-list')
        if (list) list.innerHTML = `<div class="text-center py-8 text-red-500 text-xs">${(resp && resp.message) || '加载失败，请检查登录状态'}</div>`
        return
      }
      _currentData = resp.data
      renderStatus(resp.data)
      renderPlaylists(resp.data.playlists)
      renderFailedSongs(resp.data.playlists)
      if (resp.data.progress) {
        updateProgressUI(resp.data.progress)
      }
    } catch (e) {
      console.warn('[SyncDownload] 加载状态失败:', e)
      $('sd-playlist-loading')?.classList.add('hidden')
      const list = $('sd-playlist-list')
      if (list) list.innerHTML = `<div class="text-center py-8 text-red-500 text-xs">加载失败: ${e.message}</div>`
    }
  }

  const renderStatus = (data) => {
    // 自动更新网络歌单警告
    const warning = $('sd-no-autoupdate-warning')
    if (warning) {
      warning.classList.toggle('hidden', !!data.autoUpdateNetworkList)
    }

    // 总开关
    const sw = $('sd-master-switch')
    if (sw) sw.checked = !!data.syncDownload?.enabled

    // 同步目标音质
    const qualitySelect = $('sd-quality-select')
    if (qualitySelect) {
      qualitySelect.value = data.syncDownload?.preferredQuality || '320k'
    }

    // 时间信息
    const lastTime = $('sd-last-sync-time')
    if (lastTime) lastTime.textContent = formatTime(data.syncDownload?.lastSyncTime)

    const nextTime = $('sd-next-sync-time')
    if (nextTime) {
      if (!data.autoUpdateNetworkList) {
        nextTime.textContent = '未开启自动更新'
      } else if (data.nextSyncTime) {
        nextTime.textContent = formatTime(data.nextSyncTime)
      } else {
        nextTime.textContent = '随歌单更新触发'
      }
    }

    // 歌单数量徽章
    const countTag = $('sd-playlist-count-tag')
    if (countTag && Array.isArray(data.playlists)) {
      const enabledCount = data.playlists.filter(p => p.syncConfig?.enabled).length
      countTag.textContent = `已启用 ${enabledCount} / 共 ${data.playlists.length} 个歌单`
    }

    // 上次结果
    const lastResult = $('sd-last-result')
    if (lastResult && data.syncDownload?.lastSyncResult) {
      lastResult.innerHTML = `<i class="fas fa-info-circle text-[10px]"></i><span>${_esc(data.syncDownload.lastSyncResult)}</span>`
      lastResult.classList.remove('hidden')
    } else if (lastResult) {
      lastResult.classList.add('hidden')
    }
  }

  const renderPlaylists = (playlists) => {
    const list = $('sd-playlist-list')
    if (!list) return
    $('sd-playlist-loading')?.classList.add('hidden')

    if (!playlists?.length) {
      list.innerHTML = '<div class="text-center py-10 text-gray-400 dark:text-gray-500 text-xs"><i class="fas fa-folder-open text-3xl mb-2 block opacity-30"></i>暂无歌单数据</div>'
      return
    }

    const isGlobalRunning = !!(_currentData?.progress?.isRunning)
    const currentRunningListId = _currentData?.progress?.currentListId

    list.innerHTML = playlists.map(pl => {
      const cfg = pl.syncConfig || {}
      const failCount = cfg.failedSongs?.length || 0
      const isEnabled = !!cfg.enabled
      const totalSongs = pl.songCount || 0
      const successCount = Math.max(0, totalSongs - failCount)

      // 状态判断
      let statusTagHtml = ''
      let isWaiting = false
      let isSyncing = false

      if (isGlobalRunning && isEnabled) {
        if (pl.id === currentRunningListId) {
          isSyncing = true
          statusTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse"><i class="fas fa-spinner fa-spin text-[8px]"></i>同步中</span>`
        } else {
          isWaiting = true
          statusTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"><i class="far fa-clock text-[8px]"></i>等待同步</span>`
        }
      } else if (!isEnabled) {
        statusTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-gray-500/10 text-gray-500 dark:text-gray-400 border border-gray-500/20">未开启同步</span>`
      } else if (cfg.lastSyncTime) {
        if (failCount === 0) {
          statusTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"><i class="fas fa-check-circle text-[8px]"></i>同步完成</span>`
        } else {
          statusTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"><i class="fas fa-exclamation-triangle text-[8px]"></i>部分失败</span>`
        }
      } else {
        statusTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">等待同步</span>`
      }

      // 歌曲数量/状态统计药丸（未在同步中时展示）
      let countTagHtml = ''
      if (!isSyncing) {
        if (isEnabled && cfg.lastSyncTime) {
          if (failCount === 0) {
            countTagHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 shadow-xs"><i class="fas fa-check text-[7px]"></i>全部已同步 (${totalSongs})</span>`
          } else {
            countTagHtml = `<button type="button" onclick="window.SyncDownloadPanel.toggleCardFailedList('${_esc(pl.id)}')" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800/60 transition-colors shadow-xs cursor-pointer"><i class="fas fa-exclamation-circle text-[8px]"></i>未全同步 (${failCount}首失败 / 共${totalSongs}首)<i class="fas fa-chevron-down text-[7px] ml-0.5 opacity-70"></i></button>`
          }
        }
      }

      // 手动同步单个歌单按钮（未全同步且不在同步中时显示）
      const showManualSyncBtn = isEnabled && failCount > 0 && !isGlobalRunning
      const manualSyncBtnHtml = `
        <button type="button" onclick="window.SyncDownloadPanel.triggerSinglePlaylistSync('${_esc(pl.id)}')" title="单独重新同步此歌单" class="sd-manual-sync-btn px-2.5 py-1 text-[11px] font-semibold rounded-xl bg-gradient-to-r from-emerald-500/15 to-teal-500/15 hover:from-emerald-500/25 hover:to-teal-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 ${showManualSyncBtn ? '' : 'hidden'}">
          <i class="fas fa-redo-alt text-[9px]"></i>
          <span>重试同步</span>
        </button>`

      const networkBadge = getSourceBadge(pl.source, pl.isNetwork)
      const lastSync = cfg.lastSyncTime
        ? `<span class="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1"><i class="far fa-clock text-[8px] opacity-70"></i>${formatTime(cfg.lastSyncTime)}</span>`
        : `<span class="text-[10px] text-gray-400 dark:text-gray-500">未同步</span>`

      const coverImg = pl.cover
        ? `<img src="${_esc(pl.cover)}" class="w-12 h-12 rounded-xl object-cover shadow-xs shrink-0 border border-black/5 dark:border-white/10 bg-gray-100 dark:bg-gray-800" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ''
      const fallbackCover = `<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/10 via-teal-500/15 to-emerald-600/20 dark:from-emerald-500/20 dark:to-teal-500/30 flex items-center justify-center shrink-0 shadow-xs border border-emerald-500/15" ${pl.cover ? 'style="display:none"' : ''}><i class="fas fa-music text-emerald-500 text-sm"></i></div>`

      // 展开的失败歌曲列表 HTML（采用与「我的收藏」一致的高品质列表风格）
      const failedSongsListHtml = (failCount > 0 && Array.isArray(cfg.failedSongs))
        ? `<div id="sd-card-failed-${_esc(pl.id)}" class="hidden mt-3 pt-3 border-t border-red-200/70 dark:border-red-900/50">
             <div class="flex items-center justify-between text-[11px] font-bold text-red-600 dark:text-red-400 mb-2 px-1">
               <span class="flex items-center gap-1.5"><i class="fas fa-exclamation-triangle text-[10px]"></i>未成功同步歌曲 (${failCount} 首):</span>
               <span class="text-[10px] text-gray-400 font-normal">点击右侧「重试同步」可再次尝试解析下载</span>
             </div>
             
             <!-- 歌曲列表卡片容器 -->
             <div class="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
               ${cfg.failedSongs.map((s, idx) => {
                 const sCover = s.cover
                   ? `<img src="${_esc(s.cover)}" class="w-9 h-9 rounded-lg object-cover shadow-xs border border-black/5 dark:border-white/10 shrink-0 bg-gray-100 dark:bg-gray-700" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                   : ''
                 const sFallback = `<div class="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-500 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-200/50 dark:border-red-900/40 text-xs shadow-xs" ${s.cover ? 'style="display:none"' : ''}><i class="fas fa-music text-[11px]"></i></div>`
                 const sSrcBadge = getSourceBadge(s.source, false)

                 return `
                   <div class="p-2 rounded-xl bg-gray-50/90 dark:bg-gray-800/80 hover:bg-gray-100/90 dark:hover:bg-gray-750 border border-gray-200/60 dark:border-gray-700/60 transition-colors flex items-center justify-between gap-2.5">
                     <div class="flex items-center gap-2.5 min-w-0 flex-1">
                       <div class="text-[11px] font-mono font-semibold text-gray-400 dark:text-gray-500 w-4 text-center shrink-0">${idx + 1}</div>
                       <div class="relative shrink-0">
                         ${sCover}
                         ${sFallback}
                       </div>
                       <div class="min-w-0 flex-1">
                         <div class="flex items-center gap-1.5 flex-wrap">
                           <span class="text-xs font-bold text-gray-800 dark:text-gray-100 truncate max-w-[180px] sm:max-w-[260px]" title="${_esc(s.name || s.id)}">${_esc(s.name || s.id)}</span>
                           ${sSrcBadge}
                           <span class="inline-flex items-center px-1 py-0.2 rounded text-[8px] font-bold bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800/60">未下载</span>
                         </div>
                         <div class="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                           <span class="truncate max-w-[140px] sm:max-w-[200px]" title="${_esc(s.singer || '未知歌手')}"><i class="fas fa-user text-[8px] mr-1 opacity-60"></i>${_esc(s.singer || '未知歌手')}</span>
                           ${s.album ? `<span class="text-gray-300 dark:text-gray-600">·</span><span class="truncate max-w-[100px] opacity-75" title="${_esc(s.album)}"><i class="fas fa-compact-disc text-[8px] mr-1 opacity-60"></i>${_esc(s.album)}</span>` : ''}
                           ${s.interval ? `<span class="text-gray-300 dark:text-gray-600">·</span><span class="font-mono text-[9px] opacity-75">${_esc(s.interval)}</span>` : ''}
                         </div>
                       </div>
                     </div>
                      <div class="text-right shrink-0 max-w-[130px] sm:max-w-[160px] min-w-0">
                        ${typeof window.createMarqueeHtml === 'function'
                          ? window.createMarqueeHtml(s.reason || '解析失败', 'text-[9px] text-red-500 dark:text-red-400 font-mono text-right')
                          : `<span class="text-[9px] text-red-500 dark:text-red-400 font-mono block truncate" title="${_esc(s.reason)}">${_esc(s.reason || '解析失败')}</span>`}
                      </div>
                   </div>
                 `
               }).join('')}
             </div>
           </div>`
        : ''

      return `
        <div class="sd-playlist-card p-3 rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 hover:bg-gray-50/90 dark:hover:bg-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 shadow-xs group"
             data-playlist-id="${_esc(pl.id)}">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="relative shrink-0">
                ${coverImg}
                ${fallbackCover}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-xs font-bold text-gray-800 dark:text-gray-100 truncate max-w-[170px] sm:max-w-[240px]" title="${_esc(pl.name)}">${_esc(pl.name)}</span>
                  ${networkBadge}
                  <span class="sd-status-tag">${statusTagHtml}</span>
                  ${countTagHtml}
                </div>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1 font-mono"><i class="fas fa-list-ul text-[8px] opacity-60"></i>${totalSongs} 首</span>
                  <span class="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                  <span class="sd-playlist-sync-tag">${lastSync}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              ${manualSyncBtnHtml}
              <label class="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" class="sr-only peer sd-playlist-toggle"
                       data-id="${_esc(pl.id)}"
                       ${cfg.enabled ? 'checked' : ''}
                       onchange="window.SyncDownloadPanel.onPlaylistToggle('${_esc(pl.id)}', this.checked)">
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500 shadow-inner"></div>
              </label>
            </div>
          </div>

          <!-- 歌单实时动态进度容器（正在同步该歌单时激活显示）-->
          <div class="sd-playlist-live-box hidden mt-2.5 pt-2.5 border-t border-emerald-500/20 dark:border-emerald-500/30">
            <div class="flex items-center justify-between text-[10px] mb-1.5">
              <span class="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5 truncate">
                <i class="fas fa-arrow-circle-down text-emerald-500 animate-bounce text-[9px]"></i>
                <span class="sd-live-song-title truncate">正在同步...</span>
              </span>
              <span class="sd-live-song-count font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">0/0</span>
            </div>
            <div class="w-full bg-emerald-100 dark:bg-emerald-950/60 rounded-full h-1.5 overflow-hidden">
              <div class="sd-live-progress-bar h-full bg-emerald-500 rounded-full transition-all duration-200" style="width: 0%"></div>
            </div>
          </div>

          <!-- 展开失败歌曲列表 -->
          ${failedSongsListHtml}
        </div>
      `
    }).join('')

    // 执行跑马灯检测
    if (typeof window.applyMarqueeChecks === 'function') {
      const modal = $('sync-download-modal')
      window.applyMarqueeChecks(modal || document)
    }
  }

  const renderFailedSongs = (playlists) => {
    const area = $('sd-failed-area')
    const list = $('sd-failed-list')
    if (!area || !list) return

    const allFailed = []
    for (const pl of (playlists || [])) {
      const songs = pl.syncConfig?.failedSongs || []
      for (const s of songs) {
        allFailed.push({ ...s, listName: pl.name })
      }
    }

    if (allFailed.length === 0) {
      area.classList.add('hidden')
      return
    }

    area.classList.remove('hidden')
    list.innerHTML = allFailed.map(s => {
      const reasonMarquee = typeof window.createMarqueeHtml === 'function'
        ? window.createMarqueeHtml(s.reason || '解析失败', 'text-[10px] text-red-600 dark:text-red-400')
        : `<p class="text-[10px] text-red-600 dark:text-red-400 truncate mt-0.5">${_esc(s.reason || '解析失败')}</p>`

      return `
      <div class="flex items-start gap-2.5 p-2.5 rounded-xl bg-red-50/80 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40">
        <div class="w-6 h-6 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <i class="fas fa-exclamation-triangle text-red-500 text-[10px]"></i>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-bold text-gray-800 dark:text-gray-100 truncate">${_esc(s.name)} <span class="font-normal text-gray-500 dark:text-gray-400">- ${_esc(s.singer)}</span></p>
          <div class="mt-0.5 min-w-0">${reasonMarquee}</div>
          <p class="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">歌单: ${_esc(s.listName)}</p>
        </div>
      </div>
    `}).join('')

    if (typeof window.applyMarqueeChecks === 'function') {
      window.applyMarqueeChecks(area)
    }
  }

  // ─────────────────────────────────────────────
  // 进度轮询
  // ─────────────────────────────────────────────
  const startPolling = () => {
    stopPolling()
    _pollTimer = setInterval(pollProgress, 1500)
    pollProgress()
  }

  const stopPolling = () => {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  }

  const pollProgress = async () => {
    try {
      const resp = await apiFetch('/api/user/sync-download/progress')
      if (!resp.success) return
      updateProgressUI(resp.data)
    } catch { }
  }

  const updateProgressUI = (progress) => {
    const progressArea = $('sd-progress-area')
    const triggerBtn = $('sd-trigger-btn')
    const pauseBtn = $('sd-pause-btn')

    if (!progress || !progress.isRunning) {
      if (_wasRunning) {
        _wasRunning = false
        loadStatus()
      }
      progressArea?.classList.add('hidden')
      if (pauseBtn) {
        pauseBtn.classList.add('hidden')
        pauseBtn.disabled = false
      }
      if (triggerBtn) {
        triggerBtn.disabled = false
        triggerBtn.innerHTML = '<i class="fas fa-play text-[10px]"></i>立即同步'
      }

      // 重置所有歌单卡片的高亮与实时进度
      document.querySelectorAll('.sd-playlist-card').forEach(card => {
        card.classList.remove('ring-1.5', 'ring-emerald-500', 'border-emerald-500', 'bg-emerald-50/60', 'dark:bg-emerald-950/30', 'shadow-md')
        const liveBox = card.querySelector('.sd-playlist-live-box')
        if (liveBox) liveBox.classList.add('hidden')
      })
      return
    }

    // 正在运行中
    _wasRunning = true
    progressArea?.classList.remove('hidden')
    if (pauseBtn) {
      pauseBtn.classList.remove('hidden')
      pauseBtn.disabled = false
    }
    if (triggerBtn) {
      triggerBtn.disabled = true
      triggerBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i>同步中...'
    }

    // 更新顶部总进度看板
    const listEl = $('sd-progress-list')
    if (listEl) listEl.textContent = progress.currentListName ? `歌单: ${progress.currentListName}` : '正在准备...'

    const songEl = $('sd-progress-song')
    if (songEl) songEl.textContent = progress.currentSongName ? `正在下载: ${progress.currentSongName}` : '正在检索歌曲...'

    const bar = $('sd-progress-bar')
    const count = $('sd-progress-count')
    const total = progress.totalSongs || 0
    const current = progress.overallCurrent || progress.currentSongIndex || 0
    const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
    if (bar) bar.style.width = pct + '%'
    if (count) count.textContent = `${current} / ${total}`

    const addEl = $('sd-progress-add-count')
    if (addEl) addEl.textContent = String(progress.addCount || 0)
    const delEl = $('sd-progress-del-count')
    if (delEl) delEl.textContent = String(progress.deleteCount || 0)
    const failEl = $('sd-progress-fail-count')
    if (failEl) failEl.textContent = String(progress.failCount || 0)

    // 运行期间：隐藏所有「重试同步」按钮
    document.querySelectorAll('.sd-manual-sync-btn').forEach(btn => btn.classList.add('hidden'))

    // 更新各歌单卡片内部的实时进度与状态 Tag
    document.querySelectorAll('.sd-playlist-card').forEach(card => {
      const plId = card.getAttribute('data-playlist-id')
      const liveBox = card.querySelector('.sd-playlist-live-box')
      const statusTagContainer = card.querySelector('.sd-status-tag')
      const toggleChk = card.querySelector('.sd-playlist-toggle')
      const isCardEnabled = toggleChk ? toggleChk.checked : false

      if (plId === progress.currentListId) {
        // 当前正在同步的歌单
        card.classList.add('ring-1.5', 'ring-emerald-500', 'border-emerald-500', 'bg-emerald-50/60', 'dark:bg-emerald-950/30', 'shadow-md')
        if (statusTagContainer) {
          statusTagContainer.innerHTML = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse"><i class="fas fa-spinner fa-spin text-[8px]"></i>同步中</span>`
        }
        if (liveBox) {
          liveBox.classList.remove('hidden')
          const titleEl = liveBox.querySelector('.sd-live-song-title')
          if (titleEl) titleEl.textContent = progress.currentSongName ? `下载: ${progress.currentSongName}` : '正在对比同步...'

          const countEl = liveBox.querySelector('.sd-live-song-count')
          const plTotal = progress.currentListTotalSongs || 0
          const plCur = progress.currentSongIndex || 0
          if (countEl) countEl.textContent = `${plCur}/${plTotal}`

          const plBar = liveBox.querySelector('.sd-live-progress-bar')
          const plPct = plTotal > 0 ? Math.min(100, Math.round((plCur / plTotal) * 100)) : 0
          if (plBar) plBar.style.width = plPct + '%'
        }
      } else {
        // 非当前正在同步的歌单
        card.classList.remove('ring-1.5', 'ring-emerald-500', 'border-emerald-500', 'bg-emerald-50/60', 'dark:bg-emerald-950/30', 'shadow-md')
        if (liveBox) liveBox.classList.add('hidden')
        if (statusTagContainer && isCardEnabled) {
          statusTagContainer.innerHTML = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"><i class="far fa-clock text-[8px]"></i>等待同步</span>`
        }
      }
    })
  }

  // ─────────────────────────────────────────────
  // 事件处理
  // ─────────────────────────────────────────────
  const onMasterSwitch = async (enabled) => {
    try {
      await apiFetch('/api/user/sync-download/settings', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      })
      if (_currentData?.syncDownload) _currentData.syncDownload.enabled = enabled
    } catch (e) {
      console.warn('[SyncDownload] 保存总开关失败:', e)
      const sw = $('sd-master-switch')
      if (sw) sw.checked = !enabled
    }
  }

  const onQualityChange = async (quality) => {
    try {
      await apiFetch('/api/user/sync-download/settings', {
        method: 'PUT',
        body: JSON.stringify({ preferredQuality: quality }),
      })
      if (_currentData?.syncDownload) _currentData.syncDownload.preferredQuality = quality
    } catch (e) {
      console.warn('[SyncDownload] 保存目标音质失败:', e)
    }
  }

  const onPlaylistToggle = async (listId, enabled) => {
    try {
      await apiFetch('/api/user/sync-download/settings', {
        method: 'PUT',
        body: JSON.stringify({ playlists: { [listId]: { enabled } } }),
      })
      // 更新统计药丸
      if (_currentData?.playlists) {
        const item = _currentData.playlists.find(p => p.id === listId)
        if (item && item.syncConfig) item.syncConfig.enabled = enabled
        const countTag = $('sd-playlist-count-tag')
        if (countTag) {
          const enabledCount = _currentData.playlists.filter(p => p.syncConfig?.enabled).length
          countTag.textContent = `已启用 ${enabledCount} / 共 ${_currentData.playlists.length} 个歌单`
        }
      }
    } catch (e) {
      console.warn('[SyncDownload] 保存歌单开关失败:', e)
      const chk = document.querySelector(`.sd-playlist-toggle[data-id="${listId}"]`)
      if (chk) chk.checked = !enabled
    }
  }

  const triggerSync = async () => {
    const btn = $('sd-trigger-btn')
    if (btn?.disabled) return
    try {
      btn.disabled = true
      btn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i>启动中...'
      // 立即隐藏所有卡片上的重试同步按钮
      document.querySelectorAll('.sd-manual-sync-btn').forEach(b => b.classList.add('hidden'))
      const resp = await apiFetch('/api/user/sync-download/trigger', { method: 'POST' })
      if (resp.queued) {
        _wasRunning = true
        pollProgress()
      } else {
        if (btn) {
          btn.textContent = resp.message || '已在运行中'
          setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-play text-[10px]"></i>立即同步'
            btn.disabled = false
          }, 2000)
        }
      }
    } catch (e) {
      console.warn('[SyncDownload] 触发同步失败:', e)
      if (btn) {
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-play text-[10px]"></i>立即同步'
      }
    }
  }

  const cancelSync = async () => {
    const pauseBtn = $('sd-pause-btn')
    if (pauseBtn) {
      pauseBtn.disabled = true
      pauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i>正在暂停...'
    }
    try {
      await apiFetch('/api/user/sync-download/cancel', { method: 'POST' })
      setTimeout(loadStatus, 500)
    } catch (e) {
      console.warn('[SyncDownload] 暂停同步失败:', e)
    }
  }

  const toggleCardFailedList = (playlistId) => {
    const el = $(`sd-card-failed-${playlistId}`)
    if (el) {
      const isNowHidden = el.classList.toggle('hidden')
      if (!isNowHidden && typeof window.applyMarqueeChecks === 'function') {
        window.applyMarqueeChecks(el)
      }
    }
  }

  const triggerSinglePlaylistSync = async (playlistId) => {
    if (!playlistId) return
    try {
      document.querySelectorAll('.sd-manual-sync-btn').forEach(b => b.classList.add('hidden'))
      const resp = await apiFetch(`/api/user/sync-download/trigger?playlistId=${encodeURIComponent(playlistId)}`, { method: 'POST' })
      if (resp.queued) {
        _wasRunning = true
        pollProgress()
      } else {
        loadStatus()
        alert(resp.message || '启动同步失败')
      }
    } catch (e) {
      console.warn('[SyncDownload] 触发单歌单同步失败:', e)
      loadStatus()
      alert(`启动同步失败: ${e.message}`)
    }
  }

  // ─────────────────────────────────────────────
  // 暴露公共接口
  // ─────────────────────────────────────────────
  window.SyncDownloadPanel = {
    open,
    close,
    onMasterSwitch,
    onQualityChange,
    onPlaylistToggle,
    triggerSync,
    cancelSync,
    toggleCardFailedList,
    triggerSinglePlaylistSync,
  }

  // ─────────────────────────────────────────────
  // 挂载到 LocalMusicManager（供按钮调用）
  // ─────────────────────────────────────────────
  const mountToManager = () => {
    if (window.LocalMusicManager) {
      window.LocalMusicManager.openSyncDownloadModal = open
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToManager)
  } else {
    mountToManager()
    setTimeout(mountToManager, 500)
  }

  // ESC 关闭
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = $('sync-download-modal')
      if (modal && !modal.classList.contains('hidden')) close()
    }
  })
})()
