# Current HTTP route index

Inventory of the current workspace implementation. This is an entry-point index, not a shared response schema. Authentication, request bodies and response shapes vary by handler. Fields are a partial list of directly read query/body properties, not required-field declarations; destructured fields are not exhaustively listed.

See [API reference](./reference.md). File operations are delegated to VueFinder (see the reference). Subsonic uses its configured protocol path outside `/api/*`.

## login

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/login` | — | `src/server/server.ts:1417` |

## status

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/status` | — | `src/server/server.ts:1441` |

## users

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET / POST / PUT / DELETE | `/api/users` | — | `src/server/server.ts:1513` |

## data

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/data` | `user` | `src/server/server.ts:1800` |

## data/snapshots

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/data/snapshots` | `user` | `src/server/server.ts:1862` |

## data/snapshot

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/data/snapshot` | `user`, `id` | `src/server/server.ts:1904` |

## data/restore-snapshot

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/restore-snapshot` | `user` | `src/server/server.ts:1956` |

## music/user

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/user/list/remove` | — | `src/server/server.ts:1999` |
| POST | `/api/music/user/list/reorder` | — | `src/server/server.ts:2050` |
| POST | `/api/music/user/list/add` | — | `src/server/server.ts:2107` |

## data/delete-snapshot

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/delete-snapshot` | `user` | `src/server/server.ts:2153` |

## data/upload-snapshot

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/upload-snapshot` | `user`, `time`, `filename` | `src/server/server.ts:2196` |

## user/verify

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/user/verify` | — | `src/server/server.ts:2283` |

## user/login

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/user/login` | — | `src/server/server.ts:2315` |

## user/logout

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/user/logout` | — | `src/server/server.ts:2349` |

## user/auth

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/auth/verify` | — | `src/server/server.ts:2358` |

## user/list

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/list` | `user` | `src/server/server.ts:2385` |
| POST | `/api/user/list` | `user` | `src/server/server.ts:2419` |

## user/library

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/library/artists` | — | `src/server/server.ts:2474` |
| POST | `/api/user/library/artists` | — | `src/server/server.ts:2510` |
| GET | `/api/user/library/albums` | — | `src/server/server.ts:2561` |
| POST | `/api/user/library/albums` | — | `src/server/server.ts:2597` |

## user/dislike

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/dislike/library/artists` | — | `src/server/server.ts:2649` |
| POST | `/api/user/dislike/library/artists` | — | `src/server/server.ts:2668` |
| GET | `/api/user/dislike/library/albums` | — | `src/server/server.ts:2721` |
| POST | `/api/user/dislike/library/albums` | — | `src/server/server.ts:2740` |

## user/sync-download

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/sync-download/status` | — | `src/server/server.ts:2794` |
| PUT | `/api/user/sync-download/settings` | — | `src/server/server.ts:2894` |
| POST | `/api/user/sync-download/trigger` | `playlistId` | `src/server/server.ts:2943` |
| POST | `/api/user/sync-download/cancel` | — | `src/server/server.ts:2975` |
| POST | `/api/user/sync-download/pause` | — | `src/server/server.ts:2975` |
| GET | `/api/user/sync-download/progress` | — | `src/server/server.ts:2996` |
| POST | `/api/user/sync-download/migrate-storage` | — | `src/server/server.ts:3016` |

## user/settings

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/settings` | — | `src/server/server.ts:3079` |
| POST | `/api/user/settings` | — | `src/server/server.ts:3111` |

## user/token

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET / POST | `/api/user/token/config` | — | `src/server/server.ts:3187` |
| POST | `/api/user/token/add` | — | `src/server/server.ts:3231` |
| POST | `/api/user/token/remove` | — | `src/server/server.ts:3265` |
| POST | `/api/user/token/update` | — | `src/server/server.ts:3315` |
| POST | `/api/user/token/toggle` | — | `src/server/server.ts:3356` |
| GET | `/api/user/token/logs` | `tokenMasked` | `src/server/server.ts:3392` |

## user/sound-effects

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/user/sound-effects` | — | `src/server/server.ts:3430` |
| POST | `/api/user/sound-effects` | — | `src/server/server.ts:3591` |

## tasks/status

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/tasks/status` | — | `src/server/server.ts:3454` |

## music/tasks

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/tasks/status` | — | `src/server/server.ts:3454` |
| POST | `/api/music/tasks/trigger` | `id` | `src/server/server.ts:3471` |
| GET / POST | `/api/music/tasks/user-data` | `task`, `trim` | `src/server/server.ts:3507` |

## tasks/trigger

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/tasks/trigger` | `id` | `src/server/server.ts:3471` |

## tasks/user-data

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET / POST | `/api/tasks/user-data` | `task`, `trim` | `src/server/server.ts:3507` |

## music/cache

| Method | Path | Direct fields (partial) | Handler |
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

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/utils/check-dir` | — | `src/server/server.ts:3980` |

## music/custom

| Method | Path | Direct fields (partial) | Handler |
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

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/identify` | — | `src/server/server.ts:5346` |

## music/lyric

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/lyric` | `source`, `songmid`, `songId`, `id`, `name`, `singer`, `hash`, `interval`, `copyrightId`, `albumId`, `lrcUrl`, `mrcUrl`, `trcUrl` | `src/server/server.ts:5396` |
| POST | `/api/music/lyric` | — | `src/server/server.ts:6676` |

## music/download

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET / HEAD | `/api/music/download` | `token`, `url`, `filename`, `inline`, `tag`, `taskId`, `name`, `singer`, `album`, `pic`, `lyric`, `source`, `songmid`, `hash`, `interval` | `src/server/server.ts:5576` |

## data/delete-playlist

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/delete-playlist` | — | `src/server/server.ts:5868` |

## data/delete-song

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/delete-song` | — | `src/server/server.ts:5907` |

## data/rename-playlist

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/rename-playlist` | — | `src/server/server.ts:5961` |

## data/batch-delete-songs

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/data/batch-delete-songs` | — | `src/server/server.ts:6015` |

## music/config

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/config` | — | `src/server/server.ts:6078` |

## music/auth

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/auth` | — | `src/server/server.ts:6097` |
| POST | `/api/music/auth/logout` | — | `src/server/server.ts:6165` |
| GET | `/api/music/auth/verify` | — | `src/server/server.ts:6178` |

## music/search

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/search` | `name`, `singer`, `source`, `type`, `limit`, `page` | `src/server/server.ts:6208` |

## music/tipSearch

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/tipSearch` | `name`, `source` | `src/server/server.ts:6347` |

## music/artistDetail

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/artistDetail` | `id`, `source` | `src/server/server.ts:6368` |

## music/artistAlbums

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/artistAlbums` | `id`, `source`, `page` | `src/server/server.ts:6385` |

## music/artistSongs

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/artistSongs` | `id`, `source`, `order` | `src/server/server.ts:6403` |

## music/albumSongs

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/albumSongs` | `id`, `source` | `src/server/server.ts:6433` |

## music/progress

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/progress` | `reqId` | `src/server/server.ts:6450` |

## music/url

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/url` | — | `src/server/server.ts:6473` |

## music/quality

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/quality/size` | — | `src/server/server.ts:6630` |

## music/hotSearch

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/hotSearch` | `source` | `src/server/server.ts:6701` |

## music/songList

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/songList/tags` | `source` | `src/server/server.ts:6730` |
| GET | `/api/music/songList/list` | `source`, `tagId`, `sortId`, `page` | `src/server/server.ts:6748` |
| GET | `/api/music/songList/detail` | `source`, `id`, `page` | `src/server/server.ts:6768` |
| GET | `/api/music/songList/search` | `source`, `text`, `page` | `src/server/server.ts:6795` |
| GET | `/api/music/songList/userPlaylist` | `source`, `uid`, `page` | `src/server/server.ts:6820` |

## music/leaderboard

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/leaderboard/boards` | `source` | `src/server/server.ts:6845` |
| GET | `/api/music/leaderboard/list` | `source`, `bangid`, `page` | `src/server/server.ts:6866` |

## music/comment

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/comment` | — | `src/server/server.ts:6892` |

## music/dislike

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/dislike` | — | `src/server/server.ts:6935` |
| POST | `/api/music/dislike/add` | — | `src/server/server.ts:6956` |
| POST | `/api/music/dislike/remove` | — | `src/server/server.ts:6956` |

## admin/verify

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/admin/verify` | — | `src/server/server.ts:7070` |

## custom-source/validate

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/validate` | — | `src/server/server.ts:7082` |

## custom-source/import

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/import` | — | `src/server/server.ts:7100` |

## custom-source/upload

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/upload` | — | `src/server/server.ts:7103` |

## custom-source/update

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/update` | — | `src/server/server.ts:7106` |

## custom-source/list

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/custom-source/list` | `username` | `src/server/server.ts:7109` |

## custom-source/toggle

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/toggle` | — | `src/server/server.ts:7126` |

## custom-source/delete

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/delete` | — | `src/server/server.ts:7129` |

## custom-source/reorder

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/reorder` | — | `src/server/server.ts:7133` |

## custom-source/update-platforms

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/custom-source/update-platforms` | — | `src/server/server.ts:7136` |

## config

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET / POST | `/api/config` | — | `src/server/server.ts:7150` |

## config/backups

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/config/backups` | — | `src/server/server.ts:7619` |
| GET | `/api/config/backups/download` | `file` | `src/server/server.ts:7719` |
| POST | `/api/config/backups/restore` | — | `src/server/server.ts:7795` |

## config/backup-now

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/config/backup-now` | — | `src/server/server.ts:7689` |

## config/test-proxy

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/config/test-proxy` | — | `src/server/server.ts:7849` |

## logs

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/logs` | `type`, `lines` | `src/server/server.ts:7902` |

## stats

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/stats` | — | `src/server/server.ts:7931` |

## webdav/test

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/webdav/test` | — | `src/server/server.ts:7955` |

## webdav/sync-file

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/webdav/sync-file` | — | `src/server/server.ts:7978` |

## webdav/backup

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/webdav/backup` | — | `src/server/server.ts:8015` |
| DELETE | `/api/webdav/backup` | — | `src/server/server.ts:8092` |

## webdav/sync

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/webdav/sync` | — | `src/server/server.ts:8040` |

## webdav/backups

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/webdav/backups` | — | `src/server/server.ts:8063` |

## webdav/restore

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/webdav/restore` | — | `src/server/server.ts:8137` |

## webdav/logs

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/webdav/logs` | — | `src/server/server.ts:8176` |

## webdav/progress

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/webdav/progress` | `auth` | `src/server/server.ts:8200` |

## backup/download

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/backup/download` | `auth` | `src/server/server.ts:8234` |

## backup/upload

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/backup/upload` | — | `src/server/server.ts:8269` |

## admin/reload

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/admin/reload` | — | `src/server/server.ts:8311` |

## restart

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/restart` | — | `src/server/server.ts:8328` |

## files/download

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/files/download` | `path` | `src/server/server.ts:8403` |

## music/auto-link

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| GET | `/api/music/auto-link/status` | — | `src/server/server.ts:3628` |
| GET | `/api/music/auto-link/candidates` | — | `src/server/server.ts:3632` |
| POST | `/api/music/auto-link/start` | — | `src/server/server.ts:3634` |
| POST | `/api/music/auto-link/cancel` | — | `src/server/server.ts:3630` |

## music/remaster

| Method | Path | Direct fields (partial) | Handler |
| --- | --- | --- | --- |
| POST | `/api/music/remaster/start` | — | `src/server/server.ts:3661` |
| GET | `/api/music/remaster/status` | — | `src/server/server.ts:3685` |
| POST | `/api/music/remaster/cancel` | — | `src/server/server.ts:3694` |
