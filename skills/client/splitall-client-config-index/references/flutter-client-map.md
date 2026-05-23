# Flutter Client Config Map

Primary files:

- `new/flutter_client/lib/src/services/runtime_services.dart`
- `new/flutter_client/lib/src/controllers/app_controller.dart`
- `new/flutter_client/README.md`

Portable data resolution:

1. `SPLITALL_PORTABLE_DIR`
2. sibling `portable-data` for packaged app or executable
3. application support fallback

Important files under portable data:

- `settings.json`
- `recent-runs.json`
- `checkpoints.json`
- `logs/client.log`
- `exports/`
- `mail-imports/`

Important client APIs:

- `GET /api/bootstrap`
- `POST /api/discovery/check-in`
- `POST /api/upload-sessions`
- `PUT /api/upload-sessions/:id/files/:index`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/result`
- `POST /api/export`
