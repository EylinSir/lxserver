# 当前 HTTP 路由索引

对照当前工作区实现整理。此页是路由入口索引，不是统一响应协议；各端点的鉴权、请求体和返回结构仍以对应处理分支为准。字段列仅列出分支直接读取的部分查询参数或 body 属性，不代表必填项，也不包含所有解构字段。

详解见 [API 参考](./reference.md)。文件管理独立委托给 VueFinder，见参考页文件管理章节；Subsonic 使用配置的协议路径，不属于 `/api/*`。

## login

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/login` | — | `src/server/server.ts:1417` |

## status

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/status` | — | `src/server/server.ts:1441` |

## users

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET / POST / PUT / DELETE | `/api/users` | — | `src/server/server.ts:1513` |

## data

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/data` | `user` | `src/server/server.ts:1800` |

## data/snapshots

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/data/snapshots` | `user` | `src/server/server.ts:1862` |

## data/snapshot

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/data/snapshot` | `user`, `id` | `src/server/server.ts:1904` |

## data/restore-snapshot

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/restore-snapshot` | `user` | `src/server/server.ts:1956` |

## music/user

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/user/list/remove` | — | `src/server/server.ts:1999` |
| POST | `/api/music/user/list/reorder` | — | `src/server/server.ts:2050` |
| POST | `/api/music/user/list/add` | — | `src/server/server.ts:2107` |

## data/delete-snapshot

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/delete-snapshot` | `user` | `src/server/server.ts:2153` |

## data/upload-snapshot

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/upload-snapshot` | `user`, `time`, `filename` | `src/server/server.ts:2196` |

## user/verify

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/user/verify` | — | `src/server/server.ts:2283` |

## user/login

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/user/login` | — | `src/server/server.ts:2315` |

## user/logout

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/user/logout` | — | `src/server/server.ts:2349` |

## user/auth

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/auth/verify` | — | `src/server/server.ts:2358` |

## user/list

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/list` | `user` | `src/server/server.ts:2385` |
| POST | `/api/user/list` | `user` | `src/server/server.ts:2419` |

## user/library

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/library/artists` | — | `src/server/server.ts:2474` |
| POST | `/api/user/library/artists` | — | `src/server/server.ts:2510` |
| GET | `/api/user/library/albums` | — | `src/server/server.ts:2561` |
| POST | `/api/user/library/albums` | — | `src/server/server.ts:2597` |

## user/dislike

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/dislike/library/artists` | — | `src/server/server.ts:2649` |
| POST | `/api/user/dislike/library/artists` | — | `src/server/server.ts:2668` |
| GET | `/api/user/dislike/library/albums` | — | `src/server/server.ts:2721` |
| POST | `/api/user/dislike/library/albums` | — | `src/server/server.ts:2740` |

## user/sync-download

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/sync-download/status` | — | `src/server/server.ts:2794` |
| PUT | `/api/user/sync-download/settings` | — | `src/server/server.ts:2894` |
| POST | `/api/user/sync-download/trigger` | `playlistId` | `src/server/server.ts:2943` |
| POST | `/api/user/sync-download/cancel` | — | `src/server/server.ts:2975` |
| POST | `/api/user/sync-download/pause` | — | `src/server/server.ts:2975` |
| GET | `/api/user/sync-download/progress` | — | `src/server/server.ts:2996` |
| POST | `/api/user/sync-download/migrate-storage` | — | `src/server/server.ts:3016` |

## user/settings

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/settings` | — | `src/server/server.ts:3079` |
| POST | `/api/user/settings` | — | `src/server/server.ts:3111` |

## user/token

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET / POST | `/api/user/token/config` | — | `src/server/server.ts:3187` |
| POST | `/api/user/token/add` | — | `src/server/server.ts:3231` |
| POST | `/api/user/token/remove` | — | `src/server/server.ts:3265` |
| POST | `/api/user/token/update` | — | `src/server/server.ts:3315` |
| POST | `/api/user/token/toggle` | — | `src/server/server.ts:3356` |
| GET | `/api/user/token/logs` | `tokenMasked` | `src/server/server.ts:3392` |

## user/sound-effects

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/user/sound-effects` | — | `src/server/server.ts:3430` |
| POST | `/api/user/sound-effects` | — | `src/server/server.ts:3591` |

## tasks/status

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/tasks/status` | — | `src/server/server.ts:3454` |

## music/tasks

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/tasks/status` | — | `src/server/server.ts:3454` |
| POST | `/api/music/tasks/trigger` | `id` | `src/server/server.ts:3471` |
| GET / POST | `/api/music/tasks/user-data` | `task`, `trim` | `src/server/server.ts:3507` |

## tasks/trigger

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/tasks/trigger` | `id` | `src/server/server.ts:3471` |

## tasks/user-data

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET / POST | `/api/tasks/user-data` | `task`, `trim` | `src/server/server.ts:3507` |

## music/cache

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/cache/config` | — | `src/server/server.ts:3708` |
| GET | `/api/music/cache/directories` | — | `src/server/server.ts:3778` |
| POST | `/api/music/cache/sync` | — | `src/server/server.ts:3820` |
| GET | `/api/music/cache/subdirs` | `user`, `folder` | `src/server/server.ts:3847` |
| POST | `/api/music/cache/mkdir` | — | `src/server/server.ts:3869` |
| POST | `/api/music/cache/categorize` | — | `src/server/server.ts:3903` |
| POST | `/api/music/cache/subdirs/rename` | — | `src/server/server.ts:3937` |
| POST | `/api/music/cache/subdirs/delete` | — | `src/server/server.ts:4018` |
| POST | `/api/music/cache/rename` | — | `src/server/server.ts:4061` |
| GET | `/api/music/cache/check` | `name`, `singer`, `source`, `songmid`, `songId`, `quality`, `exactQuality` | `src/server/server.ts:4088` |
| GET | `/api/music/cache/queue` | — | `src/server/server.ts:4130` |
| POST | `/api/music/cache/queue` | — | `src/server/server.ts:4142` |
| POST | `/api/music/cache/queue/concurrency` | — | `src/server/server.ts:4184` |
| POST | `/api/music/cache/queue/resume` | — | `src/server/server.ts:4205` |
| POST | `/api/music/cache/queue/remove` | — | `src/server/server.ts:4227` |
| POST | `/api/music/cache/download` | — | `src/server/server.ts:4250` |
| POST | `/api/music/cache/stop` | — | `src/server/server.ts:4340` |
| GET | `/api/music/cache/stats` | — | `src/server/server.ts:4412` |
| POST | `/api/music/cache/clear` | — | `src/server/server.ts:4437` |
| POST | `/api/music/cache/lyric/clear` | — | `src/server/server.ts:4462` |
| GET | `/api/music/cache/lyric/orphans` | — | `src/server/server.ts:4488` |
| POST | `/api/music/cache/lyric/orphans/delete` | — | `src/server/server.ts:4513` |
| GET | `/api/music/cache/progress` | `ids` | `src/server/server.ts:4551` |
| GET | `/api/music/cache/list` | `user` | `src/server/server.ts:4566` |
| GET | `/api/music/cache/cover` | `user`, `token`, `filename`, `size` | `src/server/server.ts:4612` |
| POST | `/api/music/cache/remove` | — | `src/server/server.ts:4654` |
| POST | `/api/music/cache/move` | — | `src/server/server.ts:5023` |
| POST | `/api/music/cache/switch-base` | — | `src/server/server.ts:5057` |
| POST | `/api/music/cache/updateMetadata` | — | `src/server/server.ts:5093` |
| GET | `/api/music/cache/embedLyric` | `filename`, `folder` | `src/server/server.ts:5126` |
| POST | `/api/music/cache/embedLyric` | — | `src/server/server.ts:5169` |
| POST | `/api/music/cache/link` | — | `src/server/server.ts:5317` |
| GET | `/api/music/cache/lyric` | `source`, `songmid`, `songId`, `id`, `name`, `singer` | `src/server/server.ts:5493` |
| POST | `/api/music/cache/lyric` | — | `src/server/server.ts:5531` |

## utils/check-dir

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/utils/check-dir` | — | `src/server/server.ts:3980` |

## music/custom

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/custom/list` | — | `src/server/server.ts:4731` |
| POST | `/api/music/custom/sync` | — | `src/server/server.ts:4758` |
| handler | `/api/music/custom/file` | `filename`, `user`, `token` | `src/server/server.ts:4776` |
| GET | `/api/music/custom/cover` | `user`, `token`, `filename`, `size` | `src/server/server.ts:4809` |
| POST | `/api/music/custom/remove` | — | `src/server/server.ts:4846` |
| POST | `/api/music/custom/link` | — | `src/server/server.ts:4885` |
| POST | `/api/music/custom/updateMetadata` | — | `src/server/server.ts:4920` |
| GET | `/api/music/custom/embedLyric` | `filename` | `src/server/server.ts:4952` |
| POST | `/api/music/custom/embedLyric` | — | `src/server/server.ts:4991` |

## music/identify

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/identify` | — | `src/server/server.ts:5346` |

## music/lyric

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/lyric` | `source`, `songmid`, `songId`, `id`, `name`, `singer`, `hash`, `interval`, `copyrightId`, `albumId`, `lrcUrl`, `mrcUrl`, `trcUrl` | `src/server/server.ts:5396` |
| POST | `/api/music/lyric` | — | `src/server/server.ts:6676` |

## music/download

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET / HEAD | `/api/music/download` | `token`, `url`, `filename`, `inline`, `tag`, `taskId`, `name`, `singer`, `album`, `pic`, `lyric`, `source`, `songmid`, `hash`, `interval` | `src/server/server.ts:5576` |

## data/delete-playlist

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/delete-playlist` | — | `src/server/server.ts:5868` |

## data/delete-song

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/delete-song` | — | `src/server/server.ts:5907` |

## data/rename-playlist

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/rename-playlist` | — | `src/server/server.ts:5961` |

## data/batch-delete-songs

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/data/batch-delete-songs` | — | `src/server/server.ts:6015` |

## music/config

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/config` | — | `src/server/server.ts:6078` |

## music/auth

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/auth` | — | `src/server/server.ts:6097` |
| POST | `/api/music/auth/logout` | — | `src/server/server.ts:6165` |
| GET | `/api/music/auth/verify` | — | `src/server/server.ts:6178` |

## music/search

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/search` | `name`, `singer`, `source`, `type`, `limit`, `page` | `src/server/server.ts:6208` |

## music/tipSearch

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/tipSearch` | `name`, `source` | `src/server/server.ts:6347` |

## music/artistDetail

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/artistDetail` | `id`, `source` | `src/server/server.ts:6368` |

## music/artistAlbums

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/artistAlbums` | `id`, `source`, `page` | `src/server/server.ts:6385` |

## music/artistSongs

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/artistSongs` | `id`, `source`, `order` | `src/server/server.ts:6403` |

## music/albumSongs

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/albumSongs` | `id`, `source` | `src/server/server.ts:6433` |

## music/progress

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/progress` | `reqId` | `src/server/server.ts:6450` |

## music/url

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/url` | — | `src/server/server.ts:6473` |

## music/quality

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/quality/size` | — | `src/server/server.ts:6630` |

## music/hotSearch

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/hotSearch` | `source` | `src/server/server.ts:6701` |

## music/songList

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/songList/tags` | `source` | `src/server/server.ts:6730` |
| GET | `/api/music/songList/list` | `source`, `tagId`, `sortId`, `page` | `src/server/server.ts:6748` |
| GET | `/api/music/songList/detail` | `source`, `id`, `page` | `src/server/server.ts:6768` |
| GET | `/api/music/songList/search` | `source`, `text`, `page` | `src/server/server.ts:6795` |
| GET | `/api/music/songList/userPlaylist` | `source`, `uid`, `page` | `src/server/server.ts:6820` |

## music/leaderboard

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/leaderboard/boards` | `source` | `src/server/server.ts:6845` |
| GET | `/api/music/leaderboard/list` | `source`, `bangid`, `page` | `src/server/server.ts:6866` |

## music/comment

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/comment` | — | `src/server/server.ts:6892` |

## music/dislike

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/dislike` | — | `src/server/server.ts:6935` |
| POST | `/api/music/dislike/add` | — | `src/server/server.ts:6956` |
| POST | `/api/music/dislike/remove` | — | `src/server/server.ts:6956` |

## admin/verify

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/admin/verify` | — | `src/server/server.ts:7070` |

## custom-source/validate

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/validate` | — | `src/server/server.ts:7082` |

## custom-source/import

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/import` | — | `src/server/server.ts:7100` |

## custom-source/upload

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/upload` | — | `src/server/server.ts:7103` |

## custom-source/update

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/update` | — | `src/server/server.ts:7106` |

## custom-source/list

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/custom-source/list` | `username` | `src/server/server.ts:7109` |

## custom-source/toggle

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/toggle` | — | `src/server/server.ts:7126` |

## custom-source/delete

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/delete` | — | `src/server/server.ts:7129` |

## custom-source/reorder

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/reorder` | — | `src/server/server.ts:7133` |

## custom-source/update-platforms

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/custom-source/update-platforms` | — | `src/server/server.ts:7136` |

## config

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET / POST | `/api/config` | — | `src/server/server.ts:7150` |

## config/backups

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/config/backups` | — | `src/server/server.ts:7619` |
| GET | `/api/config/backups/download` | `file` | `src/server/server.ts:7719` |
| POST | `/api/config/backups/restore` | — | `src/server/server.ts:7795` |

## config/backup-now

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/config/backup-now` | — | `src/server/server.ts:7689` |

## config/test-proxy

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/config/test-proxy` | — | `src/server/server.ts:7849` |

## logs

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/logs` | `type`, `lines` | `src/server/server.ts:7902` |

## stats

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/stats` | — | `src/server/server.ts:7931` |

## webdav/test

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/webdav/test` | — | `src/server/server.ts:7955` |

## webdav/sync-file

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/webdav/sync-file` | — | `src/server/server.ts:7978` |

## webdav/backup

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/webdav/backup` | — | `src/server/server.ts:8015` |
| DELETE | `/api/webdav/backup` | — | `src/server/server.ts:8092` |

## webdav/sync

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/webdav/sync` | — | `src/server/server.ts:8040` |

## webdav/backups

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/webdav/backups` | — | `src/server/server.ts:8063` |

## webdav/restore

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/webdav/restore` | — | `src/server/server.ts:8137` |

## webdav/logs

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/webdav/logs` | — | `src/server/server.ts:8176` |

## webdav/progress

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/webdav/progress` | `auth` | `src/server/server.ts:8200` |

## backup/download

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/backup/download` | `auth` | `src/server/server.ts:8234` |

## backup/upload

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/backup/upload` | — | `src/server/server.ts:8269` |

## admin/reload

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/admin/reload` | — | `src/server/server.ts:8311` |

## restart

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/restart` | — | `src/server/server.ts:8328` |

## files/download

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/files/download` | `path` | `src/server/server.ts:8403` |

## music/auto-link

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| GET | `/api/music/auto-link/status` | — | `src/server/server.ts:3628` |
| GET | `/api/music/auto-link/candidates` | — | `src/server/server.ts:3632` |
| POST | `/api/music/auto-link/start` | — | `src/server/server.ts:3634` |
| POST | `/api/music/auto-link/cancel` | — | `src/server/server.ts:3630` |

## music/remaster

| 方法 | 路径 | 直接读取字段（部分） | 处理位置 |
| --- | --- | --- | --- |
| POST | `/api/music/remaster/start` | — | `src/server/server.ts:3661` |
| GET | `/api/music/remaster/status` | — | `src/server/server.ts:3685` |
| POST | `/api/music/remaster/cancel` | — | `src/server/server.ts:3694` |
